// apps/api/src/services/news-service.ts
import { logger } from '../utils/logger';
import redis from '../utils/redis'; 
import gnewsProvider, { NewsArticle } from './gnews';

// Cycle definitions from your old backend to ensure diverse coverage
const FETCH_CYCLES = [
    { name: 'Cycle A: General & World', params: { topic: 'breaking-news' } },
    { name: 'Cycle B: Technology & Science', params: { topic: 'technology' } },
    { name: 'Cycle C: Business & Economy', params: { topic: 'business' } },
    { name: 'Cycle D: Nation (India)', params: { country: 'in' } }, // Localized
    { name: 'Cycle E: Entertainment & Sports', params: { topic: 'entertainment' } }
];

class NewsService {
    
    // --- Cycle Management (Round Robin) ---
    private async getAndAdvanceCycleIndex(): Promise<number> {
        const REDIS_KEY = 'SYSTEM:NEWS_CYCLE_INDEX';
        try {
            // Atomic Increment
            const newValue = await redis.incr(REDIS_KEY);
            // Reset periodically to prevent overflow
            if (newValue > 10000) await redis.set(REDIS_KEY, 0);
            
            return (newValue - 1) % FETCH_CYCLES.length;
        } catch (e) {
            return 0; // Fallback
        }
    }

    // --- Main Fetch Method called by Job ---
    async fetchNews(): Promise<NewsArticle[]> {
        const allArticles: NewsArticle[] = [];
        
        // We run 2 distinct cycles per job run to balance breadth vs. API limits
        const CYCLES_TO_RUN = 2; 

        for (let i = 0; i < CYCLES_TO_RUN; i++) {
            const cycleIndex = await this.getAndAdvanceCycleIndex();
            const currentCycle = FETCH_CYCLES[cycleIndex];
            
            logger.info(`🔄 News Cycle (${i+1}/${CYCLES_TO_RUN}): ${currentCycle.name}`);

            try {
                // Fetch using the GNews Provider we created earlier
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

        // Basic in-memory dedup before returning to handler
        const seenUrls = new Set();
        const uniqueArticles = allArticles.filter(a => {
            if (seenUrls.has(a.url)) return false;
            seenUrls.add(a.url);
            return true;
        });

        return uniqueArticles;
    }
}

export const newsService = new NewsService();
