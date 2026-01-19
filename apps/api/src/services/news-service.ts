// apps/api/src/services/news-service.ts
import { logger } from '../utils/logger';
import redis from '../utils/redis'; 
import gnewsProvider, { NewsArticle } from './gnews';
import { articleProcessor } from './article-processor';
import { clusteringService } from './clustering';
import { prisma } from '@gamut/db';
import crypto from 'crypto';

// Cycle definitions to ensure diverse coverage (Matches old backend)
const FETCH_CYCLES = [
    { name: 'Cycle A: General & World', params: { topic: 'breaking-news' } },
    { name: 'Cycle B: Technology & Science', params: { topic: 'technology' } },
    { name: 'Cycle C: Business & Economy', params: { topic: 'business' } },
    { name: 'Cycle D: Nation (India)', params: { country: 'in' } }, // Localized
    { name: 'Cycle E: Entertainment & Sports', params: { topic: 'entertainment' } }
];

const CONSTANTS = {
    REDIS_KEYS: {
        NEWS_CYCLE: 'SYSTEM:NEWS_CYCLE_INDEX',
        NEWS_SEEN_PREFIX: 'NEWS:SEEN:'
    }
};

class NewsService {
    
    // --- 1. Cycle Management (Round Robin with Redis) ---
    private async getAndAdvanceCycleIndex(): Promise<number> {
        const redisKey = CONSTANTS.REDIS_KEYS.NEWS_CYCLE;
        try {
            // Atomic Increment
            const newValue = await redis.incr(redisKey);
            // Reset periodically to prevent overflow
            if (newValue > 10000) await redis.set(redisKey, 0);
            
            return (newValue - 1) % FETCH_CYCLES.length;
        } catch (e) {
            logger.warn(`Redis Cycle Error. Defaulting to Random.`);
            // RESTORED: Fallback to Random cycle instead of 0 to prevent hotspotting Cycle A
            return Math.floor(Math.random() * FETCH_CYCLES.length);
        }
    }

    // --- 2. Redis Deduplication Locking ---
    private getRedisKey(url: string): string {
        const hash = crypto.createHash('md5').update(url).digest('hex');
        return `${CONSTANTS.REDIS_KEYS.NEWS_SEEN_PREFIX}${hash}`;
    }

    private async filterSeenOrProcessing(articles: NewsArticle[]): Promise<NewsArticle[]> {
        if (articles.length === 0) return [];

        const checks = articles.map(async (article) => {
            const key = this.getRedisKey(article.url);
            try {
                // Set NX (Only if Not Exists) with 3 minute expiry (processing lock)
                const result = await redis.set(key, 'processing', 'EX', 180, 'NX');
                return result === 'OK' ? article : null;
            } catch (e) {
                // In case of Redis error, process it safely
                return article;
            }
        });

        const results = await Promise.all(checks);
        return results.filter((a): a is NewsArticle => a !== null);
    }

    private async markAsSeenInRedis(articles: NewsArticle[]) {
        if (articles.length === 0) return;
        try {
            // Use pipeline for performance if available, or simple loop
            const pipeline = redis.pipeline();
            for (const article of articles) {
                const key = this.getRedisKey(article.url);
                // 4 hour TTL to prevent immediate re-fetch
                pipeline.set(key, '1', 'EX', 14400); 
            }
            await pipeline.exec();
        } catch (e: any) {
            logger.error(`Redis Pipeline Error: ${e.message}`);
        }
    }

    // --- 3. Database Deduplication ---
    private async filterExistingInDB(articles: NewsArticle[]): Promise<NewsArticle[]> {
        if (articles.length === 0) return [];
        const urls = articles.map(a => a.url);
        
        const existingDocs = await prisma.article.findMany({
            where: { url: { in: urls } },
            select: { url: true }
        });
        
        const existingUrls = new Set(existingDocs.map(d => d.url));
        return articles.filter(a => !existingUrls.has(a.url));
    }

    // --- 4. Main Fetch Method called by Job ---
    async fetchNews(): Promise<NewsArticle[]> {
        const allArticles: NewsArticle[] = [];
        
        // Run 2 distinct cycles per job run to balance breadth vs. API limits
        const CYCLES_TO_RUN = 2; 

        for (let i = 0; i < CYCLES_TO_RUN; i++) {
            const cycleIndex = await this.getAndAdvanceCycleIndex();
            const currentCycle = FETCH_CYCLES[cycleIndex];
            
            logger.info(`🔄 News Cycle (${i+1}/${CYCLES_TO_RUN}): ${currentCycle.name}`);

            try {
                const articles = await gnewsProvider.fetchArticles(currentCycle.params);
                if (articles.length > 0) {
                    allArticles.push(...articles);
                }
            } catch (err: any) {
                logger.error(`❌ Cycle Failed [${currentCycle.name}]: ${err.message}`);
            }
        }

        if (allArticles.length === 0) {
            logger.warn("⚠️ No articles fetched in this run.");
            return [];
        }

        // --- Processing Pipeline ---
        
        // A. Filter out items currently processing in Redis
        const potentialNewArticles = await this.filterSeenOrProcessing(allArticles);
        
        // B. Filter out items already in DB
        const dbUnseenArticles = await this.filterExistingInDB(potentialNewArticles);
        
        if (dbUnseenArticles.length === 0) {
            return [];
        }

        // C. Process Batch (AI Analysis + Save to DB)
        // Note: Assuming articleProcessor.processBatch returns the saved items
        const finalUnique = await articleProcessor.processBatch(dbUnseenArticles);
        
        // D. Mark as seen in Redis
        await this.markAsSeenInRedis(finalUnique);

        // E. Post-Processing: Cluster Optimization
        // Trigger clustering for any groups that received new articles
        if (finalUnique.length > 0) {
            const uniqueUrls = finalUnique.map(a => a.url);
            
            const savedArticles = await prisma.article.findMany({
                where: { url: { in: uniqueUrls } },
                select: { clusterId: true }
            });

            const impactedClusterIds = new Set<number>();
            savedArticles.forEach(a => {
                if (a.clusterId) impactedClusterIds.add(a.clusterId);
            });

            for (const clusterId of impactedClusterIds) {
                 await clusteringService.optimizeClusterFeed(clusterId);
            }
        }

        logger.info(`✅ Fetched & Cleaned: ${finalUnique.length} new articles`);
        return finalUnique;
    }
}

export const newsService = new NewsService();
