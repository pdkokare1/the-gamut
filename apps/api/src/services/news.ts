// apps/api/src/services/news.ts

import crypto from 'crypto';
import { redis } from '../utils/redis';
import logger from '../utils/logger';
import circuitBreaker from '../utils/CircuitBreaker';
import keyManager from '../utils/KeyManager';

// NEW IMPORTS
import { prisma } from '@gamut/db';
import { newsQueue } from '../jobs/queue';
import { articleProcessor } from './articleProcessor';

// --- Types ---
export interface NewsItem {
  title: string;
  url: string;
  source: string;
  description: string;
  imageUrl?: string;
  publishedAt: Date;
  content?: string;
  category?: string;
}

// --- Constants ---
const FETCH_CYCLES = [
  { name: 'General Mix', gnews: 'general', newsapi: 'general' },
  { name: 'Tech & Science', gnews: 'technology', newsapi: 'technology' },
  { name: 'Business & Econ', gnews: 'business', newsapi: 'business' },
  { name: 'World Politics', gnews: 'world', newsapi: 'politics' },
  { name: 'Health & Science', gnews: 'health', newsapi: 'science' },
];

const REDIS_KEYS = {
  NEWS_CYCLE: 'news:fetch_cycle_index',
  NEWS_SEEN_PREFIX: 'news:seen:',
};

// --- Providers ---

class GNewsProvider {
  async fetch(query: string): Promise<NewsItem[]> {
    return keyManager.executeWithRetry('GNEWS', async (apiKey) => {
      const url = `https://gnews.io/api/v4/top-headlines?lang=en&max=10&topic=${query}&apikey=${apiKey}`;
      const res = await fetch(url);
      
      if (!res.ok) {
         if (res.status === 429) throw new Error('Rate Limit Exceeded');
         throw new Error(`GNews ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      return (data.articles || []).map((a: any) => ({
        title: a.title,
        url: a.url,
        source: a.source?.name || 'GNews',
        description: a.description || '',
        imageUrl: a.image,
        publishedAt: new Date(a.publishedAt),
        category: query
      }));
    });
  }
}

class NewsApiProvider {
  async fetch(category: string): Promise<NewsItem[]> {
    return keyManager.executeWithRetry('NEWS_API', async (apiKey) => {
      const url = `https://newsapi.org/v2/top-headlines?language=en&pageSize=20&category=${category}&apiKey=${apiKey}`;
      const res = await fetch(url);
      
      if (!res.ok) {
         if (res.status === 429) throw new Error('Rate Limit Exceeded');
         throw new Error(`NewsAPI ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      return (data.articles || []).map((a: any) => ({
        title: a.title,
        url: a.url,
        source: a.source?.name || 'NewsAPI',
        description: a.description || '',
        imageUrl: a.urlToImage,
        publishedAt: new Date(a.publishedAt),
        category: category
      }));
    });
  }
}

// --- Main Service ---

class NewsService {
  private gnews = new GNewsProvider();
  private newsapi = new NewsApiProvider();

  /**
   * 1. ATOMIC CYCLE MANAGEMENT
   */
  private async getAndAdvanceCycleIndex(): Promise<number> {
    try {
      const newValue = await redis.incr(REDIS_KEYS.NEWS_CYCLE);
      if (newValue > 1000000) await redis.set(REDIS_KEYS.NEWS_CYCLE, '0');
      return Math.abs((newValue - 1) % FETCH_CYCLES.length);
    } catch (e) {
      logger.warn(`Redis Cycle Error: ${e instanceof Error ? e.message : e}. Defaulting to 0.`);
      return 0; 
    }
  }

  /**
   * 2. MAIN FETCH ROUTINE
   */
  async fetchLatest(): Promise<NewsItem[]> {
    const cycleIndex = await this.getAndAdvanceCycleIndex();
    const currentCycle = FETCH_CYCLES[cycleIndex];
    
    logger.info(`🔄 News Fetch Cycle: ${currentCycle.name} (Index: ${cycleIndex})`);

    let allArticles: NewsItem[] = [];
    let gnewsFailed = false;

    // A. Primary Strategy: GNews
    if (await this.shouldTry('GNEWS')) {
      try {
        const res = await this.gnews.fetch(currentCycle.gnews);
        allArticles.push(...res);
        if (res.length < 2) gnewsFailed = true;
      } catch (e) {
        logger.error(`GNews Strategy Failed: ${e instanceof Error ? e.message : 'Unknown'}`);
        await circuitBreaker.recordFailure('GNEWS');
        gnewsFailed = true;
      }
    }

    // B. Fallback Strategy: NewsAPI
    if ((allArticles.length < 5 || gnewsFailed) && await this.shouldTry('NEWS_API')) {
      logger.info('⚠️ Engaging NewsAPI fallback...');
      try {
        const res = await this.newsapi.fetch(currentCycle.newsapi);
        allArticles.push(...res);
      } catch (e) {
        logger.error(`NewsAPI Strategy Failed: ${e instanceof Error ? e.message : 'Unknown'}`);
        await circuitBreaker.recordFailure('NEWS_API');
      }
    }

    // C. Deduplication (Redis Lock)
    const uniqueFromRedis = await this.filterSeenOrProcessing(allArticles);
    
    // D. Process, Save to DB, and Queue
    // This is the new CRITICAL step that was missing
    const savedArticles = await this.processAndSaveArticles(uniqueFromRedis);

    // E. Mark as Seen (Long Term)
    await this.markAsSeenInRedis(savedArticles);

    logger.info(`✅ Pipeline Complete: Saved & Queued ${savedArticles.length} new articles.`);
    return savedArticles;
  }

  // --- PROCESSING & SAVING (NEW) ---

  private async processAndSaveArticles(articles: NewsItem[]): Promise<NewsItem[]> {
    if (articles.length === 0) return [];

    // 1. Database Check (Prisma)
    // Filter out URLs that already exist in MongoDB
    const urls = articles.map(a => a.url);
    const existingDocs = await prisma.article.findMany({
        where: { url: { in: urls } },
        select: { url: true }
    });
    const existingSet = new Set(existingDocs.map(d => d.url));
    const newToDb = articles.filter(a => !existingSet.has(a.url));

    if (newToDb.length === 0) return [];

    // 2. Logic Processing (Quality Score & Fuzzy Dedup)
    const finalBatch = articleProcessor.processBatch(newToDb);

    // 3. Save to Prisma & Add to Queue
    const savedItems: NewsItem[] = [];

    for (const item of finalBatch) {
        try {
            // Save initial record (Analysis will happen in Worker)
            const saved = await prisma.article.create({
                data: {
                    headline: item.title,
                    summary: item.description,
                    url: item.url,
                    source: item.source,
                    category: item.category || 'General',
                    publishedAt: item.publishedAt,
                    imageUrl: item.imageUrl,
                    politicalLean: 'Pending', // Will be updated by AI
                    analysisType: 'Full',
                    trustScore: 0,
                    biasScore: 0
                }
            });

            // Add to BullMQ for AI Processing
            await newsQueue.add('analyze-article', {
                articleId: saved.id, // Pass ID so worker can fetch & update
                text: item.description + " " + (item.content || ""), // Pass text for AI
                headline: item.title
            });

            savedItems.push(item);
        } catch (e) {
            logger.error(`Failed to save article ${item.title}: ${e}`);
            // Continue loop - don't fail batch
        }
    }

    return savedItems;
  }

  // --- REDIS HELPERS ---

  private async shouldTry(provider: string) {
    return !(await circuitBreaker.isOpen(provider));
  }

  private getRedisKey(url: string): string {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return `${REDIS_KEYS.NEWS_SEEN_PREFIX}${hash}`;
  }

  private async filterSeenOrProcessing(articles: NewsItem[]): Promise<NewsItem[]> {
    if (articles.length === 0) return [];
    
    const checks = articles.map(async (article) => {
        const key = this.getRedisKey(article.url);
        try {
            const result = await redis.set(key, 'processing', 'EX', 180, 'NX');
            return result === 'OK' ? article : null;
        } catch (e) {
            return article; 
        }
    });

    const results = await Promise.all(checks);
    return results.filter((a): a is NewsItem => a !== null);
  }

  private async markAsSeenInRedis(articles: NewsItem[]) {
      if (articles.length === 0) return;
      try {
          const pipeline = redis.pipeline();
          for (const article of articles) {
              const key = this.getRedisKey(article.url);
              pipeline.set(key, '1', 'EX', 172800); 
          }
          await pipeline.exec();
      } catch (e: any) {
          logger.error(`Redis Pipeline Error: ${e.message}`);
      }
  }
}

export const newsService = new NewsService();
