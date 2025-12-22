// apps/api/src/services/news.ts
import crypto from 'crypto';
import { z } from 'zod';
import { config } from '../config';
import keyManager from '../utils/KeyManager';
import circuitBreaker from '../utils/CircuitBreaker';
import logger from '../utils/logger';
import { redis } from '../utils/redis'; // Assuming your redis utility exports the client instance

// --- Types ---
export interface NewsItem {
  title: string;
  url: string;
  source: string;
  description: string;
  imageUrl?: string;
  publishedAt: Date;
  content?: string;
  category?: string; // Added to track which category this came from
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
      // GNews "topic" endpoint is better for categories than "q" search
      const url = `https://gnews.io/api/v4/top-headlines?lang=en&max=10&topic=${query}&apikey=${apiKey}`;
      const res = await fetch(url);
      
      if (!res.ok) {
         // Handle rate limits specifically
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
   * Rotates through categories (Tech -> Business -> Politics) persistence.
   */
  private async getAndAdvanceCycleIndex(): Promise<number> {
    try {
      // Atomic increment in Redis
      const newValue = await redis.incr(REDIS_KEYS.NEWS_CYCLE);
      
      // Safety reset to prevent huge numbers
      if (newValue > 1000000) {
        await redis.set(REDIS_KEYS.NEWS_CYCLE, '0');
      }

      // Modulo arithmetic to loop through the array safely
      return Math.abs((newValue - 1) % FETCH_CYCLES.length);
    } catch (e) {
      logger.warn(`Redis Cycle Error: ${e instanceof Error ? e.message : e}. Defaulting to 0.`);
      return 0; // Fallback to first category if Redis fails
    }
  }

  /**
   * 2. MAIN FETCH ROUTINE
   * Fetches -> Deduplicates (Redis) -> Returns Unique
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
        
        if (res.length < 2) {
            logger.warn(`GNews returned low yield (${res.length}). Marking for fallback.`);
            gnewsFailed = true;
        }
      } catch (e) {
        logger.error(`GNews Strategy Failed: ${e instanceof Error ? e.message : 'Unknown'}`);
        await circuitBreaker.recordFailure('GNEWS');
        gnewsFailed = true;
      }
    }

    // B. Fallback Strategy: NewsAPI
    // Trigger only if GNews failed OR yield was suspiciously low
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

    // C. Deduplication Pipeline
    // Filter against Redis "Seen" Set to ensure we never process duplicates
    const uniqueArticles = await this.filterSeenOrProcessing(allArticles);
    
    // D. Mark as Seen
    // Lock these URLs for 48h so we don't fetch them again
    await this.markAsSeenInRedis(uniqueArticles);

    logger.info(`✅ News Pipeline: ${uniqueArticles.length} unique articles ready for processing (from ${allArticles.length} raw).`);
    
    return uniqueArticles;
  }

  // --- REDIS LOCKING HELPERS ---

  private async shouldTry(provider: string) {
    return !(await circuitBreaker.isOpen(provider));
  }

  private getRedisKey(url: string): string {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return `${REDIS_KEYS.NEWS_SEEN_PREFIX}${hash}`;
  }

  /**
   * Filters out articles that are already in DB or currently being processed.
   * Sets a temporary 3-minute "Processing Lock" on new articles.
   */
  private async filterSeenOrProcessing(articles: NewsItem[]): Promise<NewsItem[]> {
    if (articles.length === 0) return [];
    
    // Process checks in parallel
    const checks = articles.map(async (article) => {
        const key = this.getRedisKey(article.url);
        try {
            // SET NX: Only set if Not Exists. 
            // EX 180: Expire in 3 minutes (in case processing crashes, lock releases)
            const result = await redis.set(key, 'processing', 'EX', 180, 'NX');
            
            // If result is 'OK', we acquired the lock -> It's new.
            return result === 'OK' ? article : null;
        } catch (e) {
            // Redis error? Fail open (process it) to be safe, or log and skip.
            logger.error(`Redis Lock Error: ${e}`);
            return article; 
        }
    });

    const results = await Promise.all(checks);
    return results.filter((a): a is NewsItem => a !== null);
  }

  /**
   * Updates the lock to a long-term "Seen" status (48 hours).
   * Call this AFTER successfully handing off to the queue/DB.
   */
  private async markAsSeenInRedis(articles: NewsItem[]) {
      if (articles.length === 0) return;

      try {
          const pipeline = redis.pipeline();
          for (const article of articles) {
              const key = this.getRedisKey(article.url);
              // Set to '1' with 48 hour expiry (172800 seconds)
              pipeline.set(key, '1', 'EX', 172800); 
          }
          await pipeline.exec();
      } catch (e: any) {
          logger.error(`Redis Pipeline Error: ${e.message}`);
      }
  }
}

export const newsService = new NewsService();
