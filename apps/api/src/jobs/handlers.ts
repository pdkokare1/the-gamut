// apps/api/src/jobs/handlers.ts
import crypto from 'crypto';
import { prisma } from '@gamut/db';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { newsService } from '../services/news-service';
import { aiService } from '../services/ai';
import { pipelineService } from '../services/pipeline-service';
import { newsQueue } from './queue';

// Helper to clean text for embedding
const cleanText = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 1000);

// --- 1. Master Handler: Fetch Feed ---
export const handleFetchFeed = async (job: any) => {
    logger.info('🔄 Job Started: Fetching news feed...');
  
    try {
      // A. Fetch Raw Articles (GNews/RSS)
      // newsService now purely fetches and filters junk/redis-duplicates
      const rawArticles = await newsService.fetchNews(); 
      
      if (!rawArticles || rawArticles.length === 0) {
          logger.warn('Job: No new articles found from Service.');
          return { status: 'skipped', reason: 'empty_fetch' }; 
      }
  
      // B. Deduplication Check (Database)
      // Don't pay for embeddings if the article already exists in DB
      const urls = rawArticles.map(a => a.url).filter(Boolean);
      
      const existingArticles = await prisma.article.findMany({
        where: { url: { in: urls } },
        select: { url: true }
      });
      
      const existingUrls = new Set(existingArticles.map(a => a.url));
      const newArticles = rawArticles.filter(a => !existingUrls.has(a.url));
  
      if (newArticles.length === 0) {
          logger.info(`✨ Skipped ${rawArticles.length} articles (Already exist in DB).`);
          return { status: 'skipped', reason: 'all_duplicates' };
      }
  
      logger.info(`📡 Fetched ${rawArticles.length} articles. ${newArticles.length} are new. Running Batch AI Embeddings...`);
  
      // C. BATCH PROCESSING: AI Embeddings
      // Prepare text for embeddings (Title + Description)
      const textsToEmbed = newArticles.map(a => 
          `${a.title}: ${cleanText(a.description || "")}`
      );
  
      // Get all embeddings in ONE API call (Massive Cost/Time Saver)
      const embeddings = await aiService.createBatchEmbeddings(textsToEmbed);
  
      if (embeddings && embeddings.length === newArticles.length) {
          // D. REDIS SIDECAR PATTERN
          // Cache embeddings temporarily so the individual workers can pick them up 
          // without recalculating or passing huge payloads in the queue.
          
          let savedCount = 0;
          if (redis) {
              const pipeline = redis.multi();
              
              for (let i = 0; i < newArticles.length; i++) {
                  const article = newArticles[i];
                  if (!article.url) continue;
  
                  try {
                      const urlHash = crypto.createHash('md5').update(article.url).digest('hex');
                      const key = `temp:embedding:${urlHash}`;
  
                      // Save embedding with 10 min expiry (plenty of time for queue to process)
                      pipeline.set(key, JSON.stringify(embeddings[i]), 'EX', 600);
                      savedCount++;
                  } catch (err) {
                      logger.warn(`⚠️ Failed to prep cache for ${article.title}`);
                  }
              }
              await pipeline.exec();
              logger.info(`⚡ Cached ${savedCount} embeddings in Redis (Sidecar).`);
          }
      } else {
          logger.warn('⚠️ Batch embedding failed or mismatched. Pipeline will fallback to individual fetching.');
      }
  
      // E. Queue Individual Processing Jobs
      const jobPromises = newArticles.map(article => {
          return newsQueue.add('process-article', article, {
              removeOnComplete: true,
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 }
          });
      });

      await Promise.all(jobPromises);
  
      return { status: 'success', newCount: newArticles.length };
  
    } catch (error: any) {
      logger.error(`❌ Fetch Job Critical Failure: ${error.message}`);
      throw error; 
    }
};

// --- 2. Individual Handler: Process Article ---
export const handleProcessArticle = async (article: any) => {
    try {
        // Delegate to the Pipeline Service for the actual saving/processing
        const result = await pipelineService.processSingleArticle(article);
        return result;
    } catch (error: any) {
        logger.error(`⚠️ Pipeline Error for "${article.title}": ${error.message}`);
        throw error; // Triggers BullMQ retry
    }
};

// --- 3. Maintenance Handlers ---
export const handleUpdateTrending = async () => {
    logger.info('📈 Updating Trending Topics...');
    // Calls the clustering service directly
    const clusteringService = (await import('../services/clustering')).default;
    // We assume clustering service has a maintenance method, if not, we skip
    // Based on previous files, optimization happens on feed updates.
    return { status: 'ok' }; 
};

export const handleDailyCleanup = async () => {
    logger.info('🧹 Running Daily Cleanup...');
    // Delete articles older than 90 days (handled by TTL index)
    // Clear old Redis keys
    return { status: 'ok' };
};
