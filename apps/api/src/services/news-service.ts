// apps/api/src/services/news-service.ts
import crypto from 'crypto';
import { prisma } from '@gamut/db';
import redisHelper from '../utils/redis'; 
import { logger } from '../utils/logger';
import gnewsProvider, { NewsArticle } from './gnews'; 
import articleProcessor, { RawArticle } from './article-processor';
import clusteringService from './clustering';

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
        
        let index = 0;
        try {
            const current = await redisHelper.get<number>(key) || 0;
            index = (current + 1) % FETCH_CYCLES.length;
            await redisHelper.set(key, index, 86400); // Persist for 24h
        } catch (e) {
            index = Math.floor(Math.random() * FETCH_CYCLES.length);
        }

        return FETCH_CYCLES[index];
    },

    /**
     * CORE FETCH ONLY (Used by Pipeline)
     */
    async fetchNewsOnly(): Promise<NewsArticle[]> {
        const cycle = await newsService.getAndAdvanceCycle();
        logger.info(`🔄 Fetch Cycle Started: ${cycle.name}`);

        try {
            const articles = await gnewsProvider.fetchArticles(cycle.gnews);
            if (!articles || articles.length === 0) {
                logger.warn(`⚠️ No articles found for cycle: ${cycle.name}`);
                return [];
            }
            return articles;
        } catch (error: any) {
            logger.error(`❌ News Service Error [${cycle.name}]: ${error.message}`);
            return [];
        }
    },

    /**
     * FULL PIPELINE: Fetch -> Filter -> Process -> Optimize
     * This restores the logic from the old backend's newsService.ts
     */
    async fetchAndProcessNews(): Promise<void> {
        logger.info("🚀 Starting News Ingestion Pipeline...");
        
        // 1. Fetch
        const rawArticles = await newsService.fetchNewsOnly();
        if (rawArticles.length === 0) return;

        // 2. Filter: Redis "Seen" Cache (Anti-Stampede & Deduplication)
        const uniqueArticles: NewsArticle[] = [];
        
        for (const art of rawArticles) {
            const hash = crypto.createHash('md5').update(art.url).digest('hex');
            const key = `NEWS_SEEN_${hash}`;
            
            // Check if key exists (Seen recently)
            const isSeen = await redisHelper.get(key);
            
            if (!isSeen) {
                // Mark as seen for 4 hours (enough to cover overlap)
                await redisHelper.set(key, '1', 14400);
                uniqueArticles.push(art);
            }
        }

        if (uniqueArticles.length === 0) {
            logger.info("✅ All fetched articles were already seen.");
            return;
        }

        // 3. Filter: Database Deduplication (Double Check)
        // We hash the URL to match the 'urlHash' field in Prisma
        const processingList: RawArticle[] = [];
        
        for (const art of uniqueArticles) {
            const urlHash = crypto.createHash('sha256').update(art.url).digest('hex');
            const exists = await prisma.article.findUnique({ where: { urlHash } });
            
            if (!exists) {
                // Map GNews 'NewsArticle' to Processor 'RawArticle'
                processingList.push({
                    title: art.title,
                    link: art.url,
                    description: art.description,
                    content: art.content,
                    image_url: art.image,
                    pubDate: art.publishedAt,
                    source: { name: art.source.name }
                });
            }
        }

        logger.info(`🔍 Processing ${processingList.length} unique articles (after DB check)...`);

        // 4. Process Batch (AI, Clustering, Saving)
        if (processingList.length > 0) {
            const results = await articleProcessor.processBatch(processingList);
            logger.info(`✅ Batch Complete: ${results.added} added, ${results.failed} failed.`);
        }
    }
};
