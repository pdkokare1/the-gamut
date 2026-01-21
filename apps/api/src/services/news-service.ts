// apps/api/src/services/news-service.ts
import https from 'https';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis'; 
import apiClient from '../utils/apiClient';
import config from '../config';
import { CONSTANTS, FETCH_CYCLES, JUNK_KEYWORDS } from '../utils/constants'; // Imported constants
import { articleProcessor } from './article-processor';
import pipelineService from './pipeline-service';
import aiService from './ai'; // Import AI service for batch embeddings
import clusteringService from './clustering'; // Import for feed optimization

// --- Types ---
export interface NewsArticle {
    source: { name: string; id?: string };
    title: string;
    description: string;
    url: string;
    image?: string;
    publishedAt: string;
    content?: string;
    embedding?: number[]; // Added to support batch embedding flow
}

const GNewsResponseSchema = z.object({
    totalArticles: z.number().optional(),
    articles: z.array(z.any()).optional()
});

class NewsService {
    
    // --- 1. GNews Fetcher Logic ---
    private async fetchFromGNews(params: any): Promise<NewsArticle[]> {
        const apiKey = config.keys?.gnews?.[0]; 
        if (!apiKey) {
            logger.warn('❌ GNews Fetch Skipped: No API key.');
            return [];
        }

        const queryParams = { 
            lang: 'en', 
            sortby: 'publishedAt', 
            max: CONSTANTS.NEWS.FETCH_LIMIT, // Use constant
            ...params, 
            apikey: apiKey 
        };

        const agent = new https.Agent({ keepAlive: false, family: 4 }); 

        try {
            const response = await apiClient.get<unknown>('https://gnews.io/api/v4/top-headlines', { 
                params: queryParams,
                timeout: 30000, 
                httpsAgent: agent
            });
            
            const result = GNewsResponseSchema.safeParse(response.data);
            if (!result.success) return [];

            return (result.data.articles || [])
                .filter((a: any) => a.url)
                .map((a: any) => ({
                    source: { name: a.source?.name || 'GNews' },
                    title: a.title || "",
                    description: a.description || a.content || "",
                    url: a.url,
                    image: a.image || undefined,
                    publishedAt: a.publishedAt || new Date().toISOString()
                }));

        } catch (error: any) {
            logger.warn(`⚠️ GNews Error: ${error.message}`);
            return [];
        }
    }

    // --- 2. Cycle Management ---
    private async getAndAdvanceCycleIndex(): Promise<number> {
        const redisKey = CONSTANTS.REDIS_KEYS.NEWS_CYCLE;
        try {
            const newValue = await redis.incr(redisKey);
            if (newValue > 1000000) await redis.set(redisKey, 0);
            
            const length = FETCH_CYCLES.length || 1; 
            return Math.abs((newValue - 1) % length);
        } catch (e) {
            logger.warn(`Redis Cycle Error: ${e}. Defaulting to random.`);
            return Math.floor(Math.random() * FETCH_CYCLES.length);
        }
    }

    // --- 3. Quality Filter (The "Trap") ---
    private isJunkContent(article: NewsArticle): boolean {
        const text = (article.title + " " + article.description).toLowerCase();
        return JUNK_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()));
    }

    // --- 4. Deduplication (Redis + DB) ---
    private getRedisKey(url: string): string {
        const hash = crypto.createHash('md5').update(url).digest('hex');
        return `${CONSTANTS.REDIS_KEYS.NEWS_SEEN_PREFIX}${hash}`;
    }

    // A. Redis Check
    private async filterSeenOrProcessing(articles: NewsArticle[]): Promise<NewsArticle[]> {
        if (articles.length === 0) return [];
        const checks = articles.map(async (article) => {
            const key = this.getRedisKey(article.url);
            try {
                // Lock for 4 hours (NX = Only if not exists)
                const result = await redis.set(key, 'processing', 'EX', 14400, 'NX');
                return result === 'OK' ? article : null;
            } catch (e) { return article; }
        });
        const results = await Promise.all(checks);
        return results.filter((a): a is NewsArticle => a !== null);
    }

    // B. Database Check
    private async filterExistingInDB(articles: NewsArticle[]): Promise<NewsArticle[]> {
        if (articles.length === 0) return [];
        const urls = articles.map(a => a.url);
        
        try {
            const existingDocs = await prisma.article.findMany({
                where: { url: { in: urls } },
                select: { url: true }
            });
            
            const existingUrls = new Set(existingDocs.map(d => d.url));
            return articles.filter(a => !existingUrls.has(a.url));
        } catch (err) {
            logger.error(`DB Filter Error: ${err}`);
            return articles; 
        }
    }

    // --- 5. Main Public Method (RESTORED BATCH FLOW) ---
    async fetchNews(): Promise<NewsArticle[]> {
        const allArticles: NewsArticle[] = [];
        
        // 2 cycles every 15 mins
        const CYCLES_TO_RUN = 2; 

        for (let i = 0; i < CYCLES_TO_RUN; i++) {
            const cycleIndex = await this.getAndAdvanceCycleIndex();
            const currentCycle = FETCH_CYCLES[cycleIndex];
            
            logger.info(`🔄 News Cycle (${i+1}/${CYCLES_TO_RUN}): ${currentCycle.name}`);
            
            const articles = await this.fetchFromGNews(currentCycle.params);
            allArticles.push(...articles);
        }

        if (allArticles.length === 0) return [];

        // --- Processing Pipeline ---
        
        // 1. Quality Filter (Junk Keywords)
        const qualityArticles = allArticles.filter(a => !this.isJunkContent(a));
        if (qualityArticles.length < allArticles.length) {
            logger.info(`🗑️ Filtered ${allArticles.length - qualityArticles.length} junk articles.`);
        }

        // 2. Redis Dedupe (Fast)
        const freshArticles = await this.filterSeenOrProcessing(qualityArticles);
        
        // 3. DB Dedupe (Bulk)
        const dbUnseenArticles = await this.filterExistingInDB(freshArticles);
        
        if (dbUnseenArticles.length === 0) return [];

        // 4. Batch Embedding (Cost Optimization)
        // Instead of embedding 1-by-1 in the pipeline, we do it here in one shot.
        logger.info(`⚡ Generating Batch Embeddings for ${dbUnseenArticles.length} articles...`);
        const textsToEmbed = dbUnseenArticles.map(a => `${a.title} ${a.description}`);
        const embeddings = await aiService.createBatchEmbeddings(textsToEmbed);

        if (embeddings && embeddings.length === dbUnseenArticles.length) {
            dbUnseenArticles.forEach((article, idx) => {
                article.embedding = embeddings[idx];
            });
        } else {
            logger.warn("⚠️ Batch embedding partial fail or mismatch. Pipeline will handle individual embeddings.");
        }
        
        // 5. Processor Cleaning 
        const cleanArticles = articleProcessor.processBatch(dbUnseenArticles);
        
        // 6. Save via Pipeline (Sequential to ensure logic integrity)
        const savedArticles: NewsArticle[] = [];
        const touchedClusters = new Set<number>();

        for (const article of cleanArticles) {
             // Pass the article (with embedding!) to the pipeline
             const success = await pipelineService.processSingleArticle(article);
             if (success) {
                 savedArticles.push(article);
                 // We need to know the cluster ID to optimize it later.
                 // Since pipeline returns boolean, we might have to query or infer it.
                 // For now, we rely on the next scheduled optimization or we assume global optimization.
             }
        }
        
        // 7. Cluster Feed Optimization (Restore Logic)
        // Since we don't get IDs back easily from processSingleArticle without changing its signature,
        // We will trigger a global optimization for the most active clusters or recent ones.
        // Or better: We assume the clustering service internally triggered an optimization check 
        // if we updated `clustering.ts` correctly (it has a fire-and-forget logic).
        
        // Explicitly calling optimization for safety if we can identify clusters
        // (This part assumes pipeline saves clusterId. If not, this is a best-effort call)
        if (savedArticles.length > 0) {
            // Find recent clusters to optimize
            const recentClusters = await prisma.article.findMany({
                where: { url: { in: savedArticles.map(a => a.url) } },
                select: { clusterId: true }
            });
            
            const clusterIds = new Set(recentClusters.map(a => a.clusterId).filter(id => id && id > 0));
            clusterIds.forEach(id => {
                clusteringService.optimizeClusterFeed(id as number).catch(console.error);
            });
        }

        logger.info(`✅ Fetched & Pipeline Complete: ${savedArticles.length} new articles.`);
        return savedArticles;
    }
}

export const newsService = new NewsService();
