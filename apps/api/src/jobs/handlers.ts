// apps/api/src/jobs/handlers.ts
import { Job } from 'bullmq';
import crypto from 'crypto';
import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';
import redis from '../utils/redis'; 
import { newsService } from '../services/news-service';
import aiService from '../services/ai';
import { queueManager } from './queue';
// Note: We will implement pipelineService next
import { pipelineService } from '../services/pipeline-service'; 

// --- 1. PRODUCER: Fetch Feed & Batch Embed ---
export const handleFetchFeed = async (job: Job) => {
    logger.info('🔄 Fetch Cycle Started...');

    // 1. Fetch raw articles from GNews (Handles cycles internally)
    const rawArticles = await newsService.fetchNews();

    if (!rawArticles.length) {
        return { status: 'skipped', reason: 'no_articles' };
    }

    // 2. Filter Existing (DB Check)
    // Prisma optimization: Fetch only URLs to check existence
    const urls = rawArticles.map(a => a.url);
    const existing = await prisma.article.findMany({
        where: { url: { in: urls } },
        select: { url: true }
    });
    const existingSet = new Set(existing.map(e => e.url));
    const newArticles = rawArticles.filter(a => !existingSet.has(a.url));

    if (!newArticles.length) {
        logger.info('✨ All articles already exist in DB.');
        return { status: 'skipped', reason: 'deduplicated' };
    }

    logger.info(`📡 New Articles Found: ${newArticles.length}. Generating Batch Embeddings...`);

    // 3. BATCH AI: Generate embeddings for all new articles at once
    const texts = newArticles.map(a => `${a.title}: ${a.description || ''}`);
    const embeddings = await aiService.createBatchEmbeddings(texts);

    // 4. SIDECAR CACHE: Save embeddings to Redis for the Worker to pick up
    // This avoids sending huge float[] arrays through the Queue payload
    if (embeddings && embeddings.length === newArticles.length) {
        for (let i = 0; i < newArticles.length; i++) {
            const article = newArticles[i];
            const hash = crypto.createHash('md5').update(article.url).digest('hex');
            const key = `temp:embedding:${hash}`;
            
            // Expire in 20 mins
            await redis.set(key, JSON.stringify(embeddings[i]), 1200); 
        }
        logger.info(`⚡ Cached ${embeddings.length} embeddings in Redis Sidecar.`);
    }

    // 5. DISPATCH: Create a 'process-article' job for each article
    const jobs = newArticles.map(article => ({
        name: 'process-article',
        data: article,
        opts: {
            jobId: crypto.createHash('md5').update(article.url).digest('hex') // Dedupe in Queue
        }
    }));

    await queueManager.addBulk(jobs);

    return { status: 'success', count: newArticles.length };
};

// --- 2. CONSUMER: Process Single Article ---
export const handleProcessArticle = async (job: Job) => {
    const articleData = job.data;
    
    // Call the Pipeline Service (We will port this file next)
    // It handles: Retrieval of Embedding from Redis, AI Analysis, DB Saving
    const result = await pipelineService.processSingleArticle(articleData);
    
    return result;
};
