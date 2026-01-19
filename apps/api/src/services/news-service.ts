// apps/api/src/services/news-service.ts
import https from 'https';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis'; 
import apiClient from '../utils/apiClient'; // Assuming you have this util
import config from '../config';
import { articleProcessor } from './article-processor';
import { clusteringService } from './clustering';

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
        const apiKey = config.keys?.gnews?.[0]; // Simple selection for now
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
            if (newValue > 10000) await redis.set(redisKey, 0);
            return (newValue - 1) % FETCH_CYCLES.length;
        } catch (e) {
            return Math.floor(Math.random() * FETCH_CYCLES.length);
        }
    }

    // --- 3. Deduplication ---
    private getRedisKey(url: string): string {
        const hash = crypto.createHash('md5').update(url).digest('hex');
        return `${CONSTANTS.REDIS_KEYS.NEWS_SEEN_PREFIX}${hash}`;
    }

    private async filterSeenOrProcessing(articles: NewsArticle[]): Promise<NewsArticle[]> {
        if (articles.length === 0) return [];
        const checks = articles.map(async (article) => {
            const key = this.getRedisKey(article.url);
            try {
                // Lock for 3 mins
                const result = await redis.set(key, 'processing', 'EX', 180, 'NX');
                return result === 'OK' ? article : null;
            } catch (e) { return article; }
        });
        const results = await Promise.all(checks);
        return results.filter((a): a is NewsArticle => a !== null);
    }

    // --- 4. Main Public Method ---
    async fetchNews(): Promise<NewsArticle[]> {
        const allArticles: NewsArticle[] = [];
        const CYCLES_TO_RUN = 2; 

        for (let i = 0; i < CYCLES_TO_RUN; i++) {
            const cycleIndex = await this.getAndAdvanceCycleIndex();
            const currentCycle = FETCH_CYCLES[cycleIndex];
            logger.info(`🔄 News Cycle (${i+1}/${CYCLES_TO_RUN}): ${currentCycle.name}`);
            
            const articles = await this.fetchFromGNews(currentCycle.params);
            allArticles.push(...articles);
        }

        if (allArticles.length === 0) return [];

        // A. Redis Dedupe
        const freshArticles = await this.filterSeenOrProcessing(allArticles);
        
        // B. Processor Cleaning (Score & Format)
        const highQualityArticles = articleProcessor.processBatch(freshArticles);

        return highQualityArticles;
    }

    // Called AFTER successful pipeline processing
    async markAsProcessed(urls: string[]) {
        if (urls.length === 0) return;
        const pipeline = redis.pipeline();
        for (const url of urls) {
            pipeline.set(this.getRedisKey(url), '1', 'EX', 86400); // 24h retention
        }
        await pipeline.exec();
    }
}

export const newsService = new NewsService();
