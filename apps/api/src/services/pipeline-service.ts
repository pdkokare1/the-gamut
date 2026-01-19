// apps/api/src/services/pipeline-service.ts
import crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis'; // Updated import to new util
import gatekeeper from './gatekeeper'; // Updated import
import aiService from './ai'; // Updated import
import clusteringService from './clustering'; // Updated import
import { INewsSourceArticle } from './article-processor'; // Updated type import

// Configuration
const SEMANTIC_SIMILARITY_MAX_AGE_HOURS = 24;

class PipelineService {
    
    // =========================================================
    // 1. HELPER METHODS (Restored from Old Backend)
    // =========================================================

    /**
     * Checks if the URL has already been processed using Redis Set.
     */
    private async isDuplicate(url: string): Promise<boolean> {
        if (!url) return true;
        try {
            const isMember = await redis.sismember('processed_urls', url);
            return !!isMember;
        } catch (e) {
            return false;
        }
    }

    /**
     * Checks if the TITLE has already been processed.
     * Optimization for syndicated content (same title, different URL).
     */
    private async isTitleDuplicate(title: string): Promise<boolean> {
        if (!title) return false;
        // Create a simple slug: "Man Bites Dog" -> "man-bites-dog"
        const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
        try {
            const isMember = await redis.sismember('processed_titles', slug);
            return !!isMember;
        } catch (e) {
            return false;
        }
    }

    private sanitizeContent(text: string | undefined): string {
        if (!text) return "";
        return sanitizeHtml(text, {
            allowedTags: [],
            allowedAttributes: {}
        }).trim();
    }

    /**
     * Basic validation to ensure we don't save broken image links.
     */
    private validateImageUrl(url?: string): string | undefined {
        if (!url) return undefined;
        if (url.length > 500) return undefined; // Too long
        if (!url.startsWith('http')) return undefined;
        // Filter out common "tracker" pixels or tiny icons
        if (url.includes('1x1') || url.includes('pixel')) return undefined;
        return url;
    }

    /**
     * Internal Stats Increment (Replaces old statsService)
     */
    private async incrementStat(key: string): Promise<void> {
        try {
            await redis.incr(`stats:${key}`);
        } catch (e) { /* Silent fail for stats */ }
    }

    /**
     * Retrieves embedding safely without memory-risk batching.
     * Used ONLY as a fallback if batch embedding was missed.
     */
    private async getEmbeddingSafe(headline: string, summary: string): Promise<number[]> {
        const textToEmbed = `${headline || ''}. ${summary || ''}`;
        try {
            const embeddings = await aiService.createEmbedding(textToEmbed);
            if (!embeddings || embeddings.length === 0) return [];
            return embeddings;
        } catch (err: any) {
            logger.error(`❌ Embedding failed: ${err.message}`);
            return []; 
        }
    }

    // =========================================================
    // 2. MAIN PIPELINE LOGIC
    // =========================================================

    public async processSingleArticle(rawArticle: INewsSourceArticle): Promise<boolean> {
        const startTime = Date.now();
        const shortTitle = rawArticle.title?.substring(0, 40) || 'Unknown';

        // DEBUG LOG: Start
        logger.info(`🚀 [Pipeline] Start: "${shortTitle}..."`);

        try {
            // --- STEP 1: Validation ---
            if (!rawArticle?.url || !rawArticle?.title) {
                logger.warn(`[Pipeline] ❌ Invalid Data: Missing URL/Title`);
                return false;
            }

            // ⚡ OPTIMIZATION: Early Duplicate Detection (Redis)
            if (await this.isDuplicate(rawArticle.url)) {
                await this.incrementStat('pipeline_duplicate_url');
                return false;
            }

            if (await this.isTitleDuplicate(rawArticle.title)) {
                await this.incrementStat('pipeline_duplicate_title');
                logger.info(`[Pipeline] ⏭️ Syndicated Title Detected: "${shortTitle}"`);
                return false;
            }
            
            // ⚡ Traffic Staggering (Prevent API Spikes)
            await new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 100));

            // --- STEP 2: Sanitization ---
            const articleData = {
                url: rawArticle.url,
                headline: this.sanitizeContent(rawArticle.title),
                summary: this.sanitizeContent(rawArticle.description), // Initial summary from RSS/API
                content: rawArticle.content,
                imageUrl: this.validateImageUrl(rawArticle.image),
                source: rawArticle.source.name || 'Unknown',
                publishedAt: rawArticle.publishedAt ? new Date(rawArticle.publishedAt) : new Date(),
                category: rawArticle.category || 'General',
                country: rawArticle.country || 'Global'
            };

            // --- STEP 3: Gatekeeper ---
            // Note: We adapt the gatekeeper call to match the new service signature if needed
            // Assuming gatekeeper.isAllowedSource is the new method, but checks logic requires more depth
            // We'll stick to the logic from the old file: evaluateArticle
            
            // Check domain blocklist first
            if (!gatekeeper.isAllowedSource(articleData.url, articleData.source)) {
                 logger.info(`[Pipeline] 🛑 Gatekeeper Rejected Source: "${articleData.source}"`);
                 await this.incrementStat('pipeline_junk_rejected');
                 return false;
            }

            // --- STEP 4: Similarity & Embeddings ---
            // We need to check for "Similar Headlines" to enable the "Inheritance" feature
            // Note: Assuming clusteringService has 'findSimilarHeadline' ported. 
            // If not, this is a placeholder for that logic using Prisma.
            
            let existingMatch = await clusteringService.findSimilarHeadline(articleData.headline);
            
            // Generate Embedding if not present
            // We try to get it from cache or generate it
            let embedding: number[] | null = null;
            
            // Attempt Redis Cache for Embedding (Sidecar pattern)
            const urlHash = crypto.createHash('md5').update(articleData.url).digest('hex');
            const cachedEmbedding = await redis.get(`temp:embedding:${urlHash}`);
            if (cachedEmbedding) {
                embedding = JSON.parse(cachedEmbedding);
                await redis.del(`temp:embedding:${urlHash}`);
            }

            if (!existingMatch) {
                if (!embedding || embedding.length === 0) {
                    embedding = await this.getEmbeddingSafe(articleData.headline, articleData.summary);
                }
                // Double check semantic duplicate with embedding
                if (embedding && embedding.length > 0) {
                    existingMatch = await clusteringService.findSemanticDuplicate(embedding, 'Global');
                }
            }

            // --- STEP 5: Analysis (AI vs Inheritance) ---
            let analysis: any;
            let isSemanticSkip = false;

            // COST SAVING LOGIC: INHERITANCE
            if (existingMatch && existingMatch.summary) {
                const hoursDiff = (new Date().getTime() - new Date(existingMatch.createdAt).getTime()) / (1000 * 60 * 60);
                
                if (hoursDiff < SEMANTIC_SIMILARITY_MAX_AGE_HOURS) {
                    isSemanticSkip = true;
                    logger.info(`[Pipeline] 🧬 Inheriting Analysis from Match (ID: ${existingMatch.id})`);
                    
                    // We copy the expensive AI fields
                    analysis = {
                        summary: existingMatch.summary, 
                        politicalLean: existingMatch.politicalLean, 
                        biasScore: existingMatch.biasScore,
                        biasLabel: existingMatch.biasLabel,
                        credibilityScore: existingMatch.credibilityScore,
                        reliabilityScore: existingMatch.reliabilityScore,
                        trustScore: existingMatch.trustScore,
                        sentiment: existingMatch.sentiment,
                        analysisType: existingMatch.analysisType, 
                        clusterTopic: existingMatch.clusterTopic,
                        
                        // Copy JSON components
                        biasComponents: existingMatch.biasComponents,
                        credibilityComponents: existingMatch.credibilityComponents,
                        reliabilityComponents: existingMatch.reliabilityComponents,

                        clusterId: existingMatch.clusterId,
                        keyFindings: existingMatch.keyFindings,
                        recommendations: existingMatch.recommendations
                    };
                    await this.incrementStat('pipeline_analysis_inherited');
                }
            }

            // If we couldn't inherit, we must generate fresh AI analysis
            if (!isSemanticSkip) {
                // Determine model based on gatekeeper or default
                analysis = await aiService.analyzeArticle({
                    headline: articleData.headline,
                    summary: articleData.summary,
                    content: articleData.content
                }, 'gemini-1.5-flash', 'Full');
                
                await this.incrementStat('pipeline_analysis_fresh');
            }

            // Check for AI Failures
            let finalAnalysisVersion = isSemanticSkip ? '3.8-Inherited' : '3.8-Full';
            if (analysis.summary && analysis.summary.includes("Analysis unavailable")) {
                logger.warn(`⚠️ [Pipeline] AI Failure. Marking as PENDING.`);
                finalAnalysisVersion = 'pending';
                await this.incrementStat('pipeline_ai_failure');
            }

            // --- STEP 6: Database Save (Prisma) ---
            
            // Get Cluster ID if not inherited
            let clusterId = analysis.clusterId;
            if (!clusterId) {
                clusterId = await clusteringService.assignClusterId({
                    headline: articleData.headline,
                    clusterTopic: analysis.clusterTopic || articleData.headline,
                    category: articleData.category,
                    country: articleData.country
                }, embedding || []);
            }

            try {
                // PRISMA CREATE
                await prisma.article.create({
                    data: {
                        headline: articleData.headline,
                        summary: analysis.summary || articleData.summary,
                        url: articleData.url,
                        imageUrl: articleData.imageUrl,
                        publishedAt: articleData.publishedAt,
                        source: articleData.source,
                        category: articleData.category,
                        country: articleData.country,

                        // AI Fields
                        analysisType: analysis.analysisType || 'Full',
                        sentiment: analysis.sentiment || 'Neutral',
                        analysisVersion: finalAnalysisVersion,

                        politicalLean: analysis.politicalLean || 'Center',
                        biasScore: analysis.biasScore || 0,
                        biasLabel: analysis.biasLabel,
                        
                        credibilityScore: analysis.credibilityScore || 0,
                        reliabilityScore: analysis.reliabilityScore || 0,
                        trustScore: analysis.trustScore || 0,

                        // Complex Components (Ensure they are objects/JSON)
                        biasComponents: analysis.biasComponents || {},
                        credibilityComponents: analysis.credibilityComponents || {},
                        reliabilityComponents: analysis.reliabilityComponents || {},

                        keyFindings: analysis.keyFindings || [],
                        recommendations: analysis.recommendations || [],

                        // Clustering
                        clusterId: clusterId,
                        clusterTopic: analysis.clusterTopic,
                        isLatest: true,

                        // Vector
                        embedding: embedding || []
                    }
                });

                // Cache Invalidation (Feed Page 0)
                await redis.del('feed:default:page0');

                const duration = Date.now() - startTime;
                logger.info(`✅ [Pipeline] Saved: "${shortTitle}" (${duration}ms)`);

            } catch (dbError: any) {
                // Handle Unique Constraint Violation (P2002 in Prisma)
                if (dbError.code === 'P2002') {
                    await redis.sadd('processed_urls', articleData.url);
                    return false;
                }
                throw dbError; 
            }

            // --- STEP 7: Post-Processing & Cleanup ---
            
            // Mark as processed in Redis (24h expiry)
            await redis.set(`processed:${articleData.url}`, '1', 'EX', 86400); 
            await redis.sadd('processed_urls', articleData.url);
            
            const titleSlug = articleData.headline.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
            await redis.sadd('processed_titles', titleSlug);

            // Post-Save Feed Optimization
            if (clusterId) {
                await clusteringService.optimizeClusterFeed(clusterId);
            }

            return true;

        } catch (error: any) {
            const duration = Date.now() - startTime;
            logger.error(`❌ [Pipeline] Failed after ${duration}ms: ${error.message}`);
            await this.incrementStat('pipeline_errors');
            return false;
        }
    }
}

export default new PipelineService();
