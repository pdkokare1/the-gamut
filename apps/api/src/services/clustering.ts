// apps/api/src/services/clustering.ts
import { prisma } from '@gamut/db';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import aiService from './ai';

// Types for Raw Mongo Results
interface MongoArticle {
  _id: { $oid: string };
  headline: string;
  clusterId?: number;
  clusterTopic?: string;
  category?: string;
  country?: string;
  publishedAt?: { $date: string };
  score?: number;
}

// --- HELPER: Optimized String Similarity (Levenshtein-based) ---
// Preserved exactly from legacy codebase for consistency
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

    // =================================================================
    // Stage 1: Fast Fuzzy Match (Text-Based)
    // =================================================================
    async findSimilarHeadline(headline: string): Promise<any | null> {
        if (!headline || headline.length < 5) return null;

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        try {
            // Prisma doesn't have native $text search, so we use raw command
            // to leverage the MongoDB Atlas Text Index efficiently.
            const rawResult = await prisma.$runCommandRaw({
                aggregate: "articles",
                pipeline: [
                    {
                        "$match": {
                            "$text": { "$search": headline },
                            "publishedAt": { "$gte": { "$date": oneDayAgo.toISOString() } }
                        }
                    },
                    { "$limit": 15 },
                    { "$project": { "headline": 1, "clusterId": 1, "clusterTopic": 1 } }
                ],
                cursor: {}
            });

            const candidates = (rawResult as any).cursor?.firstBatch as MongoArticle[] || [];
            
            let bestMatch: any = null;
            let bestScore = 0;

            for (const candidate of candidates) {
                const score = getStringSimilarity(headline, candidate.headline);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = candidate;
                }
            }

            // Threshold: 80% similarity
            if (bestScore > 0.80 && bestMatch) {
                // Return best match for metadata usage
                return bestMatch;
            }

        } catch (error: any) { 
            logger.warn(`⚠️ Clustering Fuzzy Match warning: ${error.message}`);
        }

        return null;
    }

    // =================================================================
    // Stage 2: Vector Search (Semantic Duplicate Check)
    // =================================================================
    async findSemanticDuplicate(embedding: number[] | undefined, country: string): Promise<any | null> {
        if (!embedding || embedding.length === 0) return null;

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        try {
            const rawResult = await prisma.$runCommandRaw({
                aggregate: "articles",
                pipeline: [
                    {
                        "$vectorSearch": {
                            "index": "vector_index",
                            "path": "embedding",
                            "queryVector": embedding,
                            "numCandidates": 10, 
                            "limit": 1,          
                            "filter": {
                                "country": { "$eq": country }
                            }
                        }
                    },
                    {
                        "$project": {
                            "clusterId": 1, "headline": 1, "score": { "$meta": "vectorSearchScore" } 
                        }
                    },
                    { 
                        "$match": { 
                            "publishedAt": { "$gte": { "$date": oneDayAgo.toISOString() } } 
                        } 
                    }
                ],
                cursor: {}
            });

            const candidates = (rawResult as any).cursor?.firstBatch as MongoArticle[] || [];

            // Strict Threshold: 92% similarity for pure duplicates
            if (candidates.length > 0 && (candidates[0].score || 0) >= 0.92) {
                return candidates[0];
            }
        } catch (error) { 
            // Often occurs if index isn't ready or embedding dim mismatch
        }
        
        return null;
    }

    // =================================================================
    // Stage 3: Assign Cluster ID (The Logic Core)
    // =================================================================
    async assignClusterId(newArticleData: any, embedding: number[] | undefined): Promise<number> {
        
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        let finalClusterId = 0;
        
        // 1. Try Vector Matching (Broad Clustering)
        if (embedding && embedding.length > 0) {
            try {
                const rawResult = await prisma.$runCommandRaw({
                    aggregate: "articles",
                    pipeline: [
                        {
                            "$vectorSearch": {
                                "index": "vector_index",
                                "path": "embedding",
                                "queryVector": embedding,
                                "numCandidates": 50, 
                                "limit": 1,          
                                "filter": { "country": { "$eq": newArticleData.country || 'Global' } }
                            }
                        },
                        { "$project": { "clusterId": 1, "score": { "$meta": "vectorSearchScore" } } },
                        { 
                            "$match": { 
                                "publishedAt": { "$gte": { "$date": sevenDaysAgo.toISOString() } } 
                            } 
                        }
                    ],
                    cursor: {}
                });

                const candidates = (rawResult as any).cursor?.firstBatch as MongoArticle[] || [];

                // Cluster Threshold: 82% (Looser than duplicate check)
                if (candidates.length > 0 && (candidates[0].score || 0) >= 0.82) {
                    finalClusterId = candidates[0].clusterId || 0;
                }
            } catch (error) { /* Silent fallback */ }
        }

        // 2. Fallback: Exact Field Match (Metadata)
        if (finalClusterId === 0 && newArticleData.clusterTopic) {
            const existingCluster = await prisma.article.findFirst({
                where: {
                    clusterTopic: newArticleData.clusterTopic,
                    category: newArticleData.category,
                    country: newArticleData.country,
                    publishedAt: { gte: sevenDaysAgo }
                },
                orderBy: { publishedAt: 'desc' },
                select: { clusterId: true }
            });

            if (existingCluster && existingCluster.clusterId) {
                finalClusterId = existingCluster.clusterId;
            }
        }

        // 3. Generate NEW Cluster ID (If no match found)
        if (finalClusterId === 0) {
            try {
                // Use Redis Atomic Increment for safe ID generation
                const newId = await redis.incr('GLOBAL_CLUSTER_ID');
                
                // Safety check for low IDs (in case of Redis flush)
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
            } catch (err) {
                // Fallback if Redis fails entirely
                finalClusterId = Math.floor(Date.now() / 1000); 
            }
        }

        // --- NEW: Trigger Narrative Check (Fire and Forget) ---
        setTimeout(() => {
             this.processClusterForNarrative(finalClusterId).catch(err => {
                 logger.warn(`Background Narrative Gen Error for Cluster ${finalClusterId}: ${err.message}`);
             });
        }, 5000);

        return finalClusterId;
    }

    // =================================================================
    // Stage 3.5: Feed Optimization (Last One Standing)
    // =================================================================
    // Enforces that only the newest article in a cluster is shown in the main feed
    async optimizeClusterFeed(clusterId: number): Promise<void> {
        if (!clusterId || clusterId === 0) return;

        try {
            const articles = await prisma.article.findMany({
                where: { clusterId },
                orderBy: { publishedAt: 'desc' },
                select: { id: true, publishedAt: true }
            });

            if (articles.length <= 1) return; 

            // The first one is the winner (latest)
            const latestId = articles[0].id;
            
            // All others are losers (hidden)
            const olderIds = articles.slice(1).map(a => a.id);

            // Bulk update to enforce visibility
            await prisma.$transaction([
                prisma.article.update({ where: { id: latestId }, data: { isLatest: true } }),
                prisma.article.updateMany({ 
                    where: { id: { in: olderIds } }, 
                    data: { isLatest: false } 
                })
            ]);

            logger.info(`🧹 Cluster ${clusterId} Optimized: 1 Visible, ${olderIds.length} Hidden`);

        } catch (error: any) {
            logger.warn(`Optimization failed for cluster ${clusterId}: ${error.message}`);
        }
    }

    // =================================================================
    // Stage 4: Narrative Synthesis (The "Brain")
    // =================================================================
    // Checks if we have enough articles to form a "Meta-Narrative"
    async processClusterForNarrative(clusterId: number): Promise<void> {
        // 1. Check if we already have a fresh narrative (generated in last 12 hours)
        const existingNarrative = await prisma.narrative.findUnique({ 
            where: { clusterId } 
        });
        
        if (existingNarrative) {
            const hoursOld = (Date.now() - new Date(existingNarrative.lastUpdated).getTime()) / (1000 * 60 * 60);
            if (hoursOld < 12) return; // Skip if fresh
        }

        // 2. Fetch Articles in this cluster
        const articles = await prisma.article.findMany({
            where: { clusterId },
            orderBy: { publishedAt: 'desc' },
            take: 10 
        });

        // 3. Threshold: Need 3 or more distinct sources to form a narrative
        if (articles.length < 3) return; 

        const distinctSources = new Set(articles.map(a => a.source));
        if (distinctSources.size < 3) return; 

        logger.info(`🧠 Triggering Narrative Synthesis for Cluster ${clusterId} (${articles.length} articles, ${distinctSources.size} sources)...`);

        // 4. Generate Narrative using AI Service
        const narrativeData = await aiService.generateNarrative(articles);

        if (narrativeData) {
            // 5. Save/Update Narrative using Upsert
            await prisma.narrative.upsert({
                where: { clusterId },
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
                    country: articles[0].country
                },
                update: {
                    lastUpdated: new Date(),
                    masterHeadline: narrativeData.masterHeadline,
                    executiveSummary: narrativeData.executiveSummary,
                    consensusPoints: narrativeData.consensusPoints,
                    divergencePoints: narrativeData.divergencePoints as any,
                    sourceCount: articles.length,
                    sources: Array.from(distinctSources)
                }
            });
            logger.info(`✅ Narrative Generated for Cluster ${clusterId}`);
        }
    }
}

export default new ClusteringService();
