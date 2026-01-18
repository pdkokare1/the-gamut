// apps/api/src/services/news.ts

import crypto from 'crypto';
import https from 'https';
import { z } from 'zod';
import { prisma } from '@repo/db';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis';
import KeyManager from '../utils/KeyManager';
import apiClient from '../utils/apiClient';
import config from '../config';
import { CONSTANTS, FETCH_CYCLES } from '../utils/constants';
import articleProcessor from './articleProcessor';
import clusteringService from './clustering';

// --- GNews Provider Logic (Integrated) ---

const GNewsArticleSchema = z.object({
    source: z.object({ name: z.string().optional() }).optional(),
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    url: z.string().url(),
    image: z.string().nullable().optional(),
    publishedAt: z.string().optional()
});

const GNewsResponseSchema = z.object({
    totalArticles: z.number().optional(),
    articles: z.array(GNewsArticleSchema).optional()
});

class GNewsProvider {
    constructor() {
        if (config.keys?.gnews) {
            KeyManager.registerProviderKeys('GNEWS', config.keys.gnews);
        }
    }

    async fetchArticles(params: any): Promise<any[]> {
        if (!config.keys?.gnews || config.keys.gnews.length === 0) {
            logger.warn('❌ GNews Fetch Skipped: No API keys configured.');
            return [];
        }

        return KeyManager.executeWithRetry<any[]>('GNEWS', async (apiKey) => {
            const cleanKey = apiKey.trim();
            const dynamicMax = 10; // Free tier limit optimization

            const queryParams = { 
                lang: 'en', 
                sortby: 'publishedAt', 
                max: dynamicMax,
                ...params, 
                apikey: cleanKey 
            };
            
            const url = 'https://gnews.io/api/v4/top-headlines';
            const agent = new https.Agent({ keepAlive: false, family: 4 }); // Fix for railway/vercel IPs

            try {
                const response = await apiClient.get<unknown>(url, { 
                    params: queryParams,
                    timeout: 30000, 
                    httpsAgent: agent,
                    headers: { 'Connection': 'close' }
                });
                
                return this.normalize(response.data);

            } catch (error: any) {
                const status = error.response?.status;
                const msg = error.message || 'Unknown Error';
                if (status === 429) logger.warn(`⏳ GNews Rate Limited (429). Key ending in ...${cleanKey.slice(-4)}`);
                throw new Error(`[GNews ${status}] ${msg}`);
            }
        });
    }

    private normalize(data: any): any[] {
        const result = GNewsResponseSchema.safeParse(data);
        if (!result.success) return [];

        return (result.data.articles || [])
            .filter(a => a.url)
            .map(a => ({
                source: { name: a.source?.name || 'GNews' },
                title: a.title || "",
                description: a.description || a.content || "",
                url: a.url!,
                image: a.image || undefined,
                publishedAt: a.publishedAt || new Date().toISOString()
            }));
    }
}

// --- Main News Service ---

class NewsService {
  private gnews: GNewsProvider;

  constructor() {
    this.gnews = new GNewsProvider();
    logger.info(`📰 News Service Initialized with [GNews Only]`);
  }

  private async getAndAdvanceCycleIndex(): Promise<number> {
      const redisKey = CONSTANTS.REDIS_KEYS.NEWS_CYCLE;
      
      if (redis.status === 'ready') {
          try {
              const newValue = await redis.incr(redisKey);
              if (newValue > 1000000) { 
                  await redis.set(redisKey, '0');
              }
              const length = FETCH_CYCLES.length || 1; 
              const index = Math.abs((newValue - 1) % length);
              return index;
          } catch (e) { 
              return 0; 
          }
      }
      return Math.floor(Math.random() * FETCH_CYCLES.length);
  }

  async fetchNews(): Promise<any[]> {
    const allArticles: any[] = [];
    const CYCLES_TO_RUN = 2; // Optimization from old code

    for (let i = 0; i < CYCLES_TO_RUN; i++) {
        const cycleIndex = await this.getAndAdvanceCycleIndex();
        const currentCycle = FETCH_CYCLES[cycleIndex];
        
        logger.info(`🔄 News Fetch Cycle (${i+1}/${CYCLES_TO_RUN}): ${currentCycle.name}`);

        try {
            const articles = await this.gnews.fetchArticles(currentCycle.gnews);
            if (articles.length > 0) allArticles.push(...articles);
        } catch (err: any) {
            logger.error(`❌ GNews fetch failed for ${currentCycle.name}: ${err.message}`);
        }
    }

    if (allArticles.length === 0) {
        logger.warn("❌ CRITICAL: No articles fetched in this run.");
        return [];
    }

    // 2. Processing Pipeline
    const potentialNewArticles = await this.filterSeenOrProcessing(allArticles);
    const dbUnseenArticles = await this.filterExistingInDB(potentialNewArticles);
    
    // Process Batch (Using articleProcessor to save to Prisma)
    const finalUnique = await articleProcessor.processBatch(dbUnseenArticles);
    
    // Mark as seen in Redis
    await this.markAsSeenInRedis(finalUnique);

    // 3. Post-Processing: Feed Optimization
    if (finalUnique.length > 0) {
        const uniqueUrls = finalUnique.map(a => a.url);
        
        const savedArticles = await prisma.article.findMany({
            where: { url: { in: uniqueUrls } },
            select: { clusterId: true }
        });

        const impactedClusterIds = new Set<number>();
        savedArticles.forEach(a => {
            if (a.clusterId && a.clusterId > 0) impactedClusterIds.add(a.clusterId);
        });

        for (const clusterId of impactedClusterIds) {
             await clusteringService.optimizeClusterFeed(clusterId);
        }
    }

    logger.info(`✅ Fetched & Cleaned: ${finalUnique.length} new articles`);
    return finalUnique;
  }

  private getRedisKey(url: string): string {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return `${CONSTANTS.REDIS_KEYS.NEWS_SEEN_PREFIX}${hash}`;
  }

  private async filterSeenOrProcessing(articles: any[]): Promise<any[]> {
    if (articles.length === 0) return [];
    if (redis.status !== 'ready') return articles; 

    const checks = articles.map(async (article) => {
        const key = this.getRedisKey(article.url);
        try {
            const result = await redis.set(key, 'processing', 'NX', 'EX', 180);
            return result === 'OK' ? article : null;
        } catch (e) {
            return article;
        }
    });

    const results = await Promise.all(checks);
    return results.filter((a): a is any => a !== null);
  }

  private async markAsSeenInRedis(articles: any[]) {
      if (articles.length === 0) return;
      if (redis.status === 'ready') {
          try {
              const pipeline = redis.pipeline();
              for (const article of articles) {
                  const key = this.getRedisKey(article.url);
                  pipeline.set(key, '1', 'EX', 14400); 
              }
              await pipeline.exec();
          } catch (e: any) {
              logger.error(`Redis Pipeline Error: ${e.message}`);
          }
      }
  }

  private async filterExistingInDB(articles: any[]): Promise<any[]> {
      if (articles.length === 0) return [];
      const urls = articles.map(a => a.url);
      
      const existingDocs = await prisma.article.findMany({
          where: { url: { in: urls } },
          select: { url: true }
      });
      const existingUrls = new Set(existingDocs.map(d => d.url));
      
      return articles.filter(a => !existingUrls.has(a.url));
  }
}

export default new NewsService();
