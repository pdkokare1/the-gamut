// apps/api/src/services/article-processor.ts
import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';
import aiService from './ai';
import clusteringService from './clustering';
import gatekeeperService from './gatekeeper';
import crypto from 'crypto';

// CHANGE: Exported interface for external use
export interface RawArticle {
    title: string;
    link: string;
    description?: string;
    content?: string;
    pubDate?: string;
    source?: { id?: string; name: string };
    image_url?: string;
    category?: string; // Optional input category
}

class ArticleProcessor {

    // =================================================================
    // Main Batch Entry Point (Direct Call)
    // =================================================================
    async processBatch(rawArticles: RawArticle[]): Promise<{ added: number; failed: number }> {
        let added = 0;
        let failed = 0;

        logger.info(`🏭 Processing Batch of ${rawArticles.length} articles...`);

        for (const raw of rawArticles) {
            try {
                // No pre-computed embedding in direct batch mode
                const result = await this.processSingleArticle(raw);
                if (result) added++;
                else failed++;
            } catch (error: any) {
                logger.error(`❌ Error processing ${raw.title?.substring(0, 30)}: ${error.message}`);
                failed++;
            }
        }

        return { added, failed };
    }

    // =================================================================
    // Single Article Pipeline
    // =================================================================
    async processSingleArticle(raw: RawArticle, preComputedEmbedding?: number[]): Promise<boolean> {
        
        // --- Step 1: Normalization ---
        const articleData = this.normalizeData(raw);
        if (!articleData) return false;

        // --- Step 2: Deduplication (Fast) ---
        const existingHash = await prisma.article.findUnique({
            where: { urlHash: articleData.urlHash }
        });
        if (existingHash) {
            return false; 
        }

        // --- Step 3: Gatekeeper Filter ---
        const gateCheck = await gatekeeperService.filter(articleData);
        if (!gateCheck.pass) {
            logger.debug(`🚫 Gatekeeper Blocked: ${articleData.headline} (${gateCheck.reason})`);
            return false;
        }

        // --- Step 4: Embedding (Vector) ---
        // Optimization: Use passed embedding if available
        let embedding = preComputedEmbedding;
        
        if (!embedding || embedding.length === 0) {
             embedding = (await aiService.createEmbedding(
                `${articleData.headline} ${articleData.description || ''}`
            )) || undefined;
        }

        if (!embedding) {
            logger.warn(`⚠️ No embedding generated for: ${articleData.headline} (Skipping Vector Checks)`);
        }

        // --- Step 5: Clustering ---
        const clusterId = await clusteringService.assignClusterId(articleData, embedding);

        // --- Step 6: AI Analysis (The "Brain") ---
        let analysis: any = {};
        try {
            analysis = await aiService.analyzeArticle(articleData, 'gemini-1.5-flash', 'Full');
        } catch (err) {
            logger.warn(`AI Analysis failed, saving basic record: ${articleData.headline}`);
            analysis = {
                summary: articleData.description || "No summary available.",
                category: articleData.category || "General",
                sentiment: "Neutral",
                politicalLean: "Not Applicable",
                biasScore: 0,
                trustScore: 50
            };
        }

        // --- Step 7: Database Save (Prisma) ---
        try {
            await prisma.article.create({
                data: {
                    urlHash: articleData.urlHash,
                    headline: articleData.headline,
                    originalUrl: articleData.url,
                    description: articleData.description,
                    content: articleData.content || "",
                    imageUrl: articleData.imageUrl,
                    source: articleData.source,
                    author: "Unknown",
                    publishedAt: articleData.publishedAt,
                    
                    clusterId: clusterId,
                    category: analysis.category || "General",
                    country: analysis.country || "Global",
                    language: "en",
                    
                    // @ts-ignore - Prisma needs raw vector support or specific typed client
                    embedding: embedding ? embedding : [],

                    summary: analysis.summary,
                    sentiment: analysis.sentiment,
                    biasScore: analysis.biasScore || 0,
                    politicalLean: analysis.politicalLean || "Not Applicable",
                    credibilityScore: analysis.credibilityScore || 0,
                    reliabilityScore: analysis.reliabilityScore || 0,
                    trustScore: analysis.trustScore || 0,
                    
                    keyFindings: analysis.keyFindings || [],
                    recommendations: analysis.recommendations || [],
                    biasComponents: analysis.biasComponents || {},
                    credibilityComponents: analysis.credibilityComponents || {},
                    
                    isLatest: true 
                }
            });

            if (clusterId > 0) {
                clusteringService.optimizeClusterFeed(clusterId).catch(console.error);
            }

            return true;

        } catch (dbError: any) {
            if (dbError.code === 'P2002') return false;
            logger.error(`Database Save Error: ${dbError.message}`);
            return false;
        }
    }

    // =================================================================
    // Helpers
    // =================================================================
    private normalizeData(raw: RawArticle) {
        if (!raw.link || !raw.title) return null;

        const url = raw.link.trim();
        const urlHash = crypto.createHash('sha256').update(url).digest('hex');

        let publishedAt = new Date();
        if (raw.pubDate) {
            const parsed = new Date(raw.pubDate);
            if (!isNaN(parsed.getTime())) publishedAt = parsed;
        }

        return {
            url,
            urlHash,
            headline: this.cleanText(raw.title),
            description: this.cleanText(raw.description || ""),
            content: this.cleanText(raw.content || ""),
            imageUrl: raw.image_url || "",
            source: raw.source?.name || "Unknown Source",
            publishedAt,
            category: raw.category || "General"
        };
    }

    private cleanText(text: string): string {
        if (!text) return "";
        return text.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }
}

export default new ArticleProcessor();
