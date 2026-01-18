// apps/api/src/jobs/worker.ts
import { Worker, Job } from 'bullmq';
import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';
import config from '../config';
import { QUEUE_NAME } from './queue';
import * as handlers from './handlers';

/**
 * Main Worker Process
 * This should be run as a separate process in production (e.g. Railway Worker)
 */
export const startWorker = () => {
    const connection = {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        username: config.redis.username,
        tls: config.redis.tls ? {} : undefined
    };

    const worker = new Worker(QUEUE_NAME, async (job: Job) => {
        // Ensure DB connection is alive
        await prisma.$connect();

        logger.info(`📥 Processing [${job.name}] (ID: ${job.id})`);

        try {
            switch (job.name) {
                // News Fetching (Producer)
                case 'fetch-feed':
                case 'fetch-feed-day':
                case 'fetch-feed-night':
                    return await handlers.handleFetchFeed(job);

                // Article Processing (Consumer)
                case 'process-article':
                    return await handlers.handleProcessArticle(job);

                // Maintenance
                case 'update-trending':
                    // return await handlers.handleTrendingUpdate(job);
                    return { skipped: true };

                default:
                    logger.warn(`⚠️ Unknown Job: ${job.name}`);
                    return null;
            }
        } catch (error: any) {
            logger.error(`❌ Job Failed [${job.name}]: ${error.message}`);
            throw error; // Trigger BullMQ Retry
        }
    }, {
        connection,
        concurrency: 5, // Process 5 articles in parallel
        limiter: {
            max: 10, // Max 10 jobs
            duration: 1000 // per second (Rate Limiting)
        }
    });

    worker.on('error', err => logger.error(`Worker Error: ${err.message}`));
    worker.on('failed', (job, err) => logger.error(`Job ${job?.id} Failed: ${err.message}`));

    logger.info(`👷 Worker Started [${QUEUE_NAME}] - Concurrency: 5`);
    return worker;
};
