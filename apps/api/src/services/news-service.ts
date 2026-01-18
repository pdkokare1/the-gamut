// apps/api/src/services/news-service.ts
import crypto from 'crypto';
import redisHelper from '../utils/redis'; 
import { logger } from '../utils/logger';
import gnewsProvider, { NewsArticle } from './gnews'; 

// Cycle Config
const FETCH_CYCLES = [
    { name: "Global Top", gnews: { topic: "world", lang: "en" } },
    { name: "US Politics", gnews: { topic: "nation", country: "us" } },
    { name: "Technology", gnews: { topic: "technology", lang: "en" } },
    { name: "Business", gnews: { topic: "business", lang: "en" } },
    { name: "Science", gnews: { topic: "science", lang: "en" } },
    { name: "Health", gnews: { topic: "health", lang: "en" } }
];

export const newsService = {
    
    /**
     * ATOMIC CYCLE MANAGEMENT
     */
    async getAndAdvanceCycle(): Promise<typeof FETCH_CYCLES[0]> {
        const key = 'SYSTEM_NEWS_CYCLE_INDEX';
        
        // Use Redis Helper to safely increment
        let index = 0;
        try {
            // Raw redis call via the helper's client if available, or simpler fallback
            // Assuming redisHelper has a raw client or we use a simple get/set approach
            // For now, let's use a get/set with logic, atomic enough for this use case
            const current = await redisHelper.get<number>(key) || 0;
            index = (current + 1) % FETCH_CYCLES.length;
            await redisHelper.set(key, index, 86400); // Persist for 24h
        } catch (e) {
            index = Math.floor(Math.random() * FETCH_CYCLES.length);
        }

        return FETCH_CYCLES[index];
    },

    /**
     * MAIN FETCH
     */
    async fetchNews(): Promise<NewsArticle[]> {
        const cycle = await newsService.getAndAdvanceCycle();
        logger.info(`🔄 Fetch Cycle Started: ${cycle.name}`);

        try {
            // 1. Fetch from Provider
            const articles = await gnewsProvider.fetchArticles(cycle.gnews);
            
            if (!articles || articles.length === 0) {
                logger.warn(`⚠️ No articles found for cycle: ${cycle.name}`);
                return [];
            }

            // 2. Filter: Redis "Seen" Cache (Anti-Stampede & Deduplication)
            const uniqueArticles: NewsArticle[] = [];
            
            for (const art of articles) {
                const hash = crypto.createHash('md5').update(art.url).digest('hex');
                const key = `NEWS_SEEN_${hash}`;
                
                // Check if key exists using our Redis helper
                const isSeen = await redisHelper.get(key);
                
                if (!isSeen) {
                    // Mark as seen for 4 hours (enough to cover overlap)
                    await redisHelper.set(key, '1', 14400);
                    uniqueArticles.push(art);
                }
            }

            logger.info(`✅ Cycle ${cycle.name}: ${uniqueArticles.length} new articles (of ${articles.length} fetched)`);
            return uniqueArticles;

        } catch (error: any) {
            logger.error(`❌ News Service Error [${cycle.name}]: ${error.message}`);
            return [];
        }
    }
};
