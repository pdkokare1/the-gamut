// apps/api/src/services/news-service.ts
import https from 'https';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis'; 
import apiClient from '../utils/apiClient';
import config from '../config';
import { articleProcessor } from './article-processor';
import pipelineService from './pipeline-service'; // Use the main pipeline

// --- Types ---
export interface NewsArticle {
    source: { name: string; id?: string };
    title: string;
    description: string;
    url: string;
    image?: string;
    publishedAt: string;
    content?: string;
}

const GNewsResponseSchema = z.object({
    totalArticles: z.number().optional(),
    articles: z.array(z.any()).optional()
});

// --- Cycles Configuration ---
// Restored strict cycle logic
const FETCH_CYCLES = [
    { name: 'Cycle A: General & World', params: { topic: 'breaking-news' } },
    { name: 'Cycle B: Technology & Science', params: { topic: 'technology' } },
    { name: 'Cycle C: Business & Economy', params: { topic: 'business' } },
    { name: 'Cycle D: Nation (India)', params: { country: 'in' } }, 
    { name: 'Cycle E: Entertainment', params: { topic: 'entertainment' } }
];

const CONSTANTS = {
    REDIS_KEYS: {
        NEWS_CYCLE: 'SYSTEM:NEWS_CYCLE_INDEX',
        NEWS_SEEN_PREFIX: 'NEWS:SEEN:'
    }
};

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
            max: 10,
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
            // Reset periodically to prevent overflow
            if (newValue > 1000000) await redis.set(redisKey, 0);
            
            const length = FETCH_CYCLES.length || 1; 
            // 0-based index
            return Math.abs((newValue - 1) % length);
        } catch (e) {
            logger.warn(`Redis Cycle Error: ${e}. Defaulting to random.`);
            return Math.floor(Math.random() * FETCH_CYCLES.length);
        }
    }

    // --- 3. Deduplication (Redis + DB) ---
    private getRedisKey(url: string): string {
        const hash = crypto.createHash('md5').update(url).digest('hex');
        return `${CONSTANTS.REDIS_KEYS.NEWS_SEEN_PREFIX}${hash}`;
    }

    // A. Filter what we are currently processing (Redis Lock)
    private async filterSeenOrProcessing(articles: NewsArticle[]): Promise<NewsArticle[]> {
        if (articles.length === 0) return [];
        const checks = articles.map(async (article) => {
            const key = this.getRedisKey(article.url);
            try {
                // Lock for 3 mins (NX = Only if not exists)
                const result = await redis.set(key, 'processing', 'EX', 180, 'NX');
                return result === 'OK' ? article : null;
            } catch (e) { return article; }
        });
        const results = await Promise.all(checks);
        return results.filter((a): a is NewsArticle => a !== null);
    }

    // B. Filter what is ALREADY in the DB (Bulk Check) - RESTORED FEATURE
    private async filterExistingInDB(articles: NewsArticle[]): Promise<NewsArticle[]> {
        if (articles.length === 0) return [];
        const urls = articles.map(a => a.url);
        
        try {
            // Bulk find in Prisma
            const existingDocs = await prisma.article.findMany({
                where: { url: { in: urls } },
                select: { url: true }
            });
            
            const existingUrls = new Set(existingDocs.map(d => d.url));
            return articles.filter(a => !existingUrls.has(a.url));
        } catch (err) {
            logger.error(`DB Filter Error: ${err}`);
            return articles; // Fail safe, let pipeline handle duplicates
        }
    }

    // --- 4. Main Public Method ---
    async fetchNews(): Promise<NewsArticle[]> {
        const allArticles: NewsArticle[] = [];
        
        // RESTORED: Specific cycle tuning
        // Running 2 cycles every 15 mins = 192 reqs/day (Safe within 300 limit)
        const CYCLES_TO_RUN = 2; 

        for (let i = 0; i < CYCLES_TO_RUN; i++) {
            const cycleIndex = await this.getAndAdvanceCycleIndex();
            const currentCycle = FETCH_CYCLES[cycleIndex];
            
            logger.info(`🔄 News Cycle (${i+1}/${CYCLES_TO_RUN}): ${currentCycle.name}`);
            
            const articles = await this.fetchFromGNews(currentCycle.params);
            allArticles.push(...articles);
        }

        if (allArticles.length === 0) {
            logger.warn("❌ CRITICAL: No articles fetched from GNews in this run.");
            return [];
        }

        // --- Processing Pipeline ---
        
        // 1. Redis Dedupe (Fast)
        const freshArticles = await this.filterSeenOrProcessing(allArticles);
        
        // 2. DB Dedupe (Bulk) - Restored for efficiency
        const dbUnseenArticles = await this.filterExistingInDB(freshArticles);
        
        // 3. Processor Cleaning (Score & Format)
        // Note: We use articleProcessor to clean, but pipelineService to Save.
        const cleanArticles = articleProcessor.processBatch(dbUnseenArticles);
        
        // 4. Save via Pipeline (One by One for robust logic)
        const savedArticles: NewsArticle[] = [];
        for (const article of cleanArticles) {
             const success = await pipelineService.processSingleArticle(article);
             if (success) savedArticles.push(article);
        }
        
        // 5. Mark as Seen in Redis (Final Confirmation)
        await this.markAsSeenInRedis(savedArticles);

        logger.info(`✅ Fetched & Pipeline Complete: ${savedArticles.length} new articles.`);
        return savedArticles;
    }

    private async markAsSeenInRedis(articles: NewsArticle[]) {
        if (articles.length === 0) return;
        try {
            const pipeline = redis.pipeline();
            for (const article of articles) {
                const key = this.getRedisKey(article.url);
                // 4h retention (Restored from old logic)
                pipeline.set(key, '1', 'EX', 14400); 
            }
            await pipeline.exec();
        } catch (e: any) {
            logger.error(`Redis Mark Error: ${e.message}`);
        }
    }
}

export const newsService = new NewsService();
