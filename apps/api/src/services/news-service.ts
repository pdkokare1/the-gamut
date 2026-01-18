// apps/api/src/services/news-service.ts
import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import redis from '../utils/redis';
import config from '../config';
import { prisma } from '@gamut/db';

// Types
export interface NewsArticle {
    title: string;
    description: string;
    content: string;
    url: string;
    image: string;
    publishedAt: string;
    source: { name: string; url: string };
}

// Cycle Config (Ported from constants)
const FETCH_CYCLES = [
    { name: "Global Top", gnews: { topic: "world", lang: "en" } },
    { name: "US Politics", gnews: { topic: "nation", country: "us" } },
    { name: "Technology", gnews: { topic: "technology", lang: "en" } },
    { name: "Business", gnews: { topic: "business", lang: "en" } }
];

export const newsService = {
    
    /**
     * ATOMIC CYCLE MANAGEMENT
     * Rotates through topics to stay within API limits
     */
    async getAndAdvanceCycle(): Promise<typeof FETCH_CYCLES[0]> {
        const key = 'system:news_cycle_index';
        const current = await redis.incr(key);
        
        // Loop back to 0 if we exceed length
        const index = (current - 1) % FETCH_CYCLES.length;
        return FETCH_CYCLES[index];
    },

    /**
     * MAIN FETCH
     */
    async fetchNews(): Promise<NewsArticle[]> {
        const cycle = await newsService.getAndAdvanceCycle();
        logger.info(`🔄 Fetch Cycle: ${cycle.name}`);

        const apiKey = config.keys.gnews; // Ensure this exists in your config
        if (!apiKey) {
            logger.warn('❌ Missing GNews API Key');
            return [];
        }

        try {
            // GNews API Call
            const response = await axios.get('https://gnews.io/api/v4/top-headlines', {
                params: {
                    token: apiKey,
                    ...cycle.gnews,
                    max: 10 // Fetch 10 per cycle
                },
                timeout: 10000
            });

            const articles = response.data.articles || [];
            if (!articles.length) return [];

            // Filter: Redis "Seen" Cache (Processing Lock)
            // We check if we have seen this URL recently to avoid processing checks
            const uniqueArticles: NewsArticle[] = [];
            
            for (const art of articles) {
                const hash = crypto.createHash('md5').update(art.url).digest('hex');
                const key = `news:seen:${hash}`;
                
                // Set processing lock for 3 hours
                // "NX" means only set if it doesn't exist
                const isNew = await redis.set(key, '1', 10800, true); 
                
                if (isNew) {
                    uniqueArticles.push(art);
                }
            }

            return uniqueArticles;

        } catch (error: any) {
            logger.error(`❌ GNews Fetch Error [${cycle.name}]: ${error.message}`);
            return [];
        }
    }
};
