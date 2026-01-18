// apps/api/src/services/clustering.ts

import { prisma } from '@repo/db';
import { redis } from '../utils/redis'; // Updated import
import { logger } from '../utils/logger';
import aiService from './ai'; // Point to new AI service
import { Prisma } from '@prisma/client';

// --- HELPER: Optimized String Similarity ---
function getStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const s2 = str2.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const len1 = s1.length;
    const len2 = s2.length;

    if (len1 > len2) return getStringSimilarity(s2, s1);

    let prevRow = new Array(len1 + 1);
    let currRow = new Array(len1 + 1);

    for (let i = 0; i <= len1; i++) {
        prevRow[i] = i;
    }

    for (let j = 1; j <= len2; j++) {
        currRow[0] = j;
        for (let i = 1; i <= len1; i++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            currRow[i] = Math.min(
                currRow[i - 1] + 1,     // insertion
                prevRow[i] + 1,         // deletion
                prevRow[i - 1] + cost   // substitution
            );
        }
        [prevRow, currRow] = [currRow, prevRow];
    }

    const distance = prevRow[len1];
    const maxLength = Math.max(len1, len2);
    return 1 - (distance / maxLength);
}

class ClusteringService {

    // --- Stage 1: Fast Fuzzy Match (Prisma Version) ---
    async findSimilarHeadline(headline: string): Promise<any | null> {
        if (!headline || headline.length < 5) return null;

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        try {
            // Prisma doesn't support Text Index Search easily without Raw
            // We fetch candidates by date and filter manually or use raw find
            // For performance, we'll use findMany with strict date filter and refine in memory
            // OR use aggregateRaw if $text is critical. 
            // Here we stick to a simpler "contains" or Raw for safety if traffic is high.
            // Using aggregateRaw for Text Search support:
            
            const candidates = await prisma.article.aggregateRaw({
                pipeline: [
                    { $match: { $text: { $search: headline }, publishedAt: { $gte: { $date: oneDayAgo } } } },
                    { $limit: 15 },
                    { $project: { headline: 1, clusterId: 1, clusterTopic: 1 } }
                ]
            }) as unknown as any[];

            if (!Array.isArray(candidates)) return null;

            let bestMatch: any = null;
            let bestScore = 0;

            for (const candidate of candidates) {
                const score = getStringSimilarity(headline, candidate.headline);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = candidate;
                }
            }

            if (bestScore > 0.80 && bestMatch) {
                return bestMatch;
            }

        } catch (error: any) { 
            logger.warn(`⚠️ Clustering Fuzzy Match warning: ${error.message}`);
        }

        return null;
    }

    // --- Stage 2: Vector Search (Prisma Raw) ---
    async findSemanticDuplicate(embedding: number[] | undefined, country: string): Promise<any | null> {
        if (!embedding || embedding.length === 0) return null;

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        try {
            // Raw MongoDB Pipeline passed through Prisma
            const result = await prisma.article.aggregateRaw({
                pipeline: [
                    {
                        "$vectorSearch": {
                            "index": "vector_index",
                            "path": "embedding",
                            "queryVector": embedding,
                            "numCandidates": 10, 
                            "limit": 1,          
                            "filter": { "country": { "$eq": country } }
                        }
                    },
                    {
                        "$project": {
                            "clusterId": 1, "headline": 1, "score": { "$meta": "vectorSearchScore" } 
                        }
                    },
                    { "$match": { "publishedAt": { "$gte": { $date: oneDayAgo } } } }
                ]
            }) as unknown as any[];

            if (result.length > 0 && result[0].score >= 0.92) {
                return result[0];
            }
        } catch (error) { /* Ignore vector errors */ }
        
        return null;
    }

    // --- Stage 3: Assign Cluster ID ---
    async assignClusterId(newArticleData: any, embedding: number[] | undefined): Promise<number> {
        
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        let finalClusterId = 0;
        
        // 1. Try Vector Matching
        if (embedding && embedding.length > 0) {
            try {
                const result = await prisma.article.aggregateRaw({
                    pipeline: [
                        {
                            "$vectorSearch": {
                                "index": "vector_index",
                                "path": "embedding",
                                "queryVector": embedding,
                                "numCandidates": 50, 
                                "limit": 1,          
                                "filter": { "country": { "$eq": newArticleData.country } }
                            }
                        },
                        { "$project": { "clusterId": 1, "score": { "$meta": "vectorSearchScore" } } },
                        { "$match": { "publishedAt": { "$gte": { $date: sevenDaysAgo } } } }
                    ]
                }) as unknown as any[];

                if (result.length > 0 && result[0].score >= 0.82) {
                    finalClusterId = result[0].clusterId;
                }
            } catch (error) { /* Silent fallback */ }
        }

        // 2. Fallback: Field Match 
        if (finalClusterId === 0 && newArticleData.clusterTopic) {
            const existingCluster = await prisma.article.findFirst({
                where: {
                    clusterTopic: newArticleData.clusterTopic,
                    category: newArticleData.category,
                    country: newArticleData.country,
                    publishedAt: { gte: sevenDaysAgo }
                },
                select: { clusterId: true },
                orderBy: { publishedAt: 'desc' }
            });

            if (existingCluster && existingCluster.clusterId) {
                finalClusterId = existingCluster.clusterId;
            }
        }

        // 3. Generate NEW Cluster ID (Redis Atomic Increment)
        if (finalClusterId === 0) {
            try {
                if (redis.status === 'ready') {
                    // Use incr directly
                    const newId = await redis.incr('GLOBAL_CLUSTER_ID');
                    
                    // Safety: Ensure we don't overlap with existing IDs if Redis was flushed
                    if (newId < 100) {
                         const maxIdDoc = await prisma.article.findFirst({
                             orderBy: { clusterId: 'desc' },
                             select: { clusterId: true }
                         });
                         const dbMax = maxIdDoc?.clusterId || 10000;
                         if (dbMax >= newId) {
                             await redis.set('GLOBAL_CLUSTER_ID', dbMax + 1);
                             finalClusterId = dbMax + 1;
                         } else {
                             finalClusterId = newId;
                         }
                    } else {
                        finalClusterId = newId;
                    }
                } else {
                    finalClusterId = Math.floor(Date.now() / 1000); 
                }
            } catch (err) {
                finalClusterId = Math.floor(Date.now() / 1000); 
            }
        }

        // --- Trigger Narrative Check ---
        setTimeout(() => {
             this.processClusterForNarrative(finalClusterId).catch(err => {
                 logger.warn(`Background Narrative Gen Error for Cluster ${finalClusterId}: ${err.message}`);
             });
        }, 5000);

        return finalClusterId;
    }

    // --- Stage 3.5: Feed Optimization ---
    async optimizeClusterFeed(clusterId: number): Promise<void> {
        if (!clusterId || clusterId === 0) return;

        try {
            const articles = await prisma.article.findMany({
                where: { clusterId },
                orderBy: { publishedAt: 'desc' },
                select: { id: true, publishedAt: true }
            });

            if (articles.length <= 1) return;

            const latestId = articles[0].id;
            const olderIds = articles.slice(1).map(a => a.id);

            // Transactional update
            await prisma.$transaction([
                prisma.article.update({ where: { id: latestId }, data: { isLatest: true } }),
                prisma.article.updateMany({ where: { id: { in: olderIds } }, data: { isLatest: false } })
            ]);

            logger.info(`🧹 Cluster ${clusterId} Optimized: 1 Visible, ${olderIds.length} Hidden`);

        } catch (error: any) {
            logger.warn(`Optimization failed for cluster ${clusterId}: ${error.message}`);
        }
    }

    // --- Stage 4: Narrative Synthesis ---
    async processClusterForNarrative(clusterId: number): Promise<void> {
        const existingNarrative = await prisma.narrative.findUnique({ where: { clusterId } });
        
        if (existingNarrative) {
            const hoursOld = (Date.now() - existingNarrative.lastUpdated.getTime()) / (1000 * 60 * 60);
            if (hoursOld < 12) return;
        }

        const articles = await prisma.article.findMany({
            where: { clusterId },
            orderBy: { publishedAt: 'desc' },
            take: 10
        });

        // Threshold: Need 3 or more distinct sources
        if (articles.length < 3) return;
        const distinctSources = new Set(articles.map(a => a.source));
        if (distinctSources.size < 3) return;

        logger.info(`🧠 Triggering Narrative Synthesis for Cluster ${clusterId}...`);

        // @ts-ignore
        const narrativeData = await aiService.generateNarrative(articles);

        if (narrativeData) {
            // Upsert Narrative using Prisma
            await prisma.narrative.upsert({
                where: { clusterId },
                update: {
                    lastUpdated: new Date(),
                    masterHeadline: narrativeData.masterHeadline,
                    executiveSummary: narrativeData.executiveSummary,
                    consensusPoints: narrativeData.consensusPoints,
                    divergencePoints: narrativeData.divergencePoints as any, // Cast JSON/Mixed
                    sourceCount: articles.length,
                    sources: Array.from(distinctSources),
                    category: articles[0].category,
                    country: articles[0].country
                },
                create: {
                    clusterId,
                    lastUpdated: new Date(),
                    masterHeadline: narrativeData.masterHeadline,
                    executiveSummary: narrativeData.executiveSummary,
                    consensusPoints: narrativeData.consensusPoints,
                    divergencePoints: narrativeData.divergencePoints as any,
                    sourceCount: articles.length,
                    sources: Array.from(distinctSources),
                    category: articles[0].category,
                    country: articles[0].country || "Global"
                }
            });
            logger.info(`✅ Narrative Generated for Cluster ${clusterId}`);
        }
    }
}

export default new ClusteringService();
