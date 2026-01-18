// apps/api/src/services/article-processor.ts
import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';
import aiService from './ai';
import clusteringService from './clustering';
import gatekeeperService from './gatekeeper';
import crypto from 'crypto';

// Types matches the Raw Article Input from Scrapers
interface RawArticle {
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
    // Main Batch Entry Point
    // =================================================================
    async processBatch(rawArticles: RawArticle[]): Promise<{ added: number; failed: number }> {
        let added = 0;
        let failed = 0;

        logger.info(`🏭 Processing Batch of ${rawArticles.length} articles...`);

        // Process strictly sequentially to manage AI Rate Limits
        // (In a real worker environment, we might parallelize this slightly, e.g., Promise.all of size 3)
        for (const raw of rawArticles) {
            try {
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
    private async processSingleArticle(raw: RawArticle): Promise<boolean> {
        
        // --- Step 1: Normalization ---
        const articleData = this.normalizeData(raw);
        if (!articleData) return false;

        // --- Step 2: Deduplication (Fast) ---
        // Check URL Hash first
        const existingHash = await prisma.article.findUnique({
            where: { urlHash: articleData.urlHash }
        });
        if (existingHash) {
            // Update timestamp if seen again? Usually ignore.
            return false; 
        }

        // --- Step 3: Gatekeeper Filter ---
        const gateCheck = await gatekeeperService.filter(articleData);
        if (!gateCheck.pass) {
            logger.debug(`🚫 Gatekeeper Blocked: ${articleData.headline} (${gateCheck.reason})`);
            return false;
        }

        // --- Step 4: Embedding (Vector) ---
        // We generate this *before* clustering because clustering relies on it.
        const embedding = await aiService.createEmbedding(
            `${articleData.headline} ${articleData.description || ''}`
        );

        if (!embedding) {
            logger.warn(`⚠️ No embedding generated for: ${articleData.headline} (Skipping Vector Checks)`);
        }

        // --- Step 5: Clustering ---
        // Assigns a Cluster ID (Event Group)
        const clusterId = await clusteringService.assignClusterId(articleData, embedding || undefined);

        // --- Step 6: AI Analysis (The "Brain") ---
        // We perform full analysis for the main DB record
        let analysis: any = {};
        try {
            analysis = await aiService.analyzeArticle(articleData, 'gemini-1.5-flash', 'Full');
        } catch (err) {
            // Fallback: Save as "Basic" if AI fails, don't lose the data
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
                    // Unique IDs
                    urlHash: articleData.urlHash,
                    
                    // Core Data
                    headline: articleData.headline,
                    originalUrl: articleData.url,
                    description: articleData.description,
                    content: articleData.content || "",
                    imageUrl: articleData.imageUrl,
                    source: articleData.source,
                    author: "Unknown", // Scrapers need to provide this if available
                    publishedAt: articleData.publishedAt,
                    
                    // Logic / AI Data
                    clusterId: clusterId,
                    category: analysis.category || "General",
                    country: analysis.country || "Global",
                    language: "en",
                    
                    // Vector Data
                    // Note: Prisma schema must have Unsupported("vector(768)") or similar
                    // If using MongoDB, it's just a float array
                    embedding: embedding ? embedding : [],

                    // AI Analysis Results
                    summary: analysis.summary,
                    sentiment: analysis.sentiment,
                    biasScore: analysis.biasScore || 0,
                    politicalLean: analysis.politicalLean || "Not Applicable",
                    credibilityScore: analysis.credibilityScore || 0,
                    reliabilityScore: analysis.reliabilityScore || 0,
                    trustScore: analysis.trustScore || 0,
                    
                    // JSON Fields (Complex Data)
                    keyFindings: analysis.keyFindings || [],
                    recommendations: analysis.recommendations || [],
                    biasComponents: analysis.biasComponents || {},
                    credibilityComponents: analysis.credibilityComponents || {},
                    
                    // Meta
                    isLatest: true // Will be fixed by clustering optimization later
                }
            });

            // Trigger post-save optimization (background)
            if (clusterId > 0) {
                // Ensure only one "latest" article per cluster
                clusteringService.optimizeClusterFeed(clusterId).catch(console.error);
            }

            return true;

        } catch (dbError: any) {
            if (dbError.code === 'P2002') {
                // Unique constraint failed (race condition on URL hash)
                return false;
            }
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
        
        // Generate Hash for Deduplication
        const urlHash = crypto.createHash('sha256').update(url).digest('hex');

        // Parse Date
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
        return text
            .replace(/<[^>]*>?/gm, '') // Strip HTML
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')      // Collapse whitespace
            .trim();
    }
}

export default new ArticleProcessor();
