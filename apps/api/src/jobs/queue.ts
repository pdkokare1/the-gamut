// apps/api/src/jobs/queue.ts
import { Queue, ConnectionOptions } from 'bullmq';
import { logger } from '../utils/logger';
import config from '../config'; 

// Constants
export const QUEUE_NAME = 'gamut-news-queue';

// Queue Registry
const queues: Record<string, Queue> = {};

export const queueManager = {
    /**
     * Initialize Queues
     * Safe to call multiple times (idempotent)
     */
    initialize: () => {
        if (queues[QUEUE_NAME]) return;

        const connection = {
             host: config.redis.host,
             port: config.redis.port,
             password: config.redis.password,
             username: config.redis.username,
             tls: config.redis.tls ? {} : undefined
        } as ConnectionOptions;

        try {
            queues[QUEUE_NAME] = new Queue(QUEUE_NAME, {
                connection,
                defaultJobOptions: {
                    removeOnComplete: 50, // Keep last 50 for debugging
                    removeOnFail: 100,
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 5000 }
                }
            });

            logger.info(`✅ Queue Initialized: [${QUEUE_NAME}]`);
            
            // Re-schedule cron jobs on startup to ensure they are active
            queueManager.scheduleRepeatable('fetch-feed', '*/15 * * * *', {}); // Every 15 mins

        } catch (err: any) {
            logger.error(`❌ Queue Init Failed: ${err.message}`);
        }
    },

    /**
     * Add a job to the queue
     */
    add: async (name: string, data: any, opts: any = {}) => {
        if (!queues[QUEUE_NAME]) queueManager.initialize();
        return await queues[QUEUE_NAME].add(name, data, opts);
    },

    /**
     * Add multiple jobs efficiently
     */
    addBulk: async (jobs: { name: string; data: any; opts?: any }[]) => {
        if (!queues[QUEUE_NAME]) queueManager.initialize();
        return await queues[QUEUE_NAME].addBulk(jobs);
    },

    /**
     * Schedule a Cron Job
     */
    scheduleRepeatable: async (name: string, pattern: string, data: any) => {
        if (!queues[QUEUE_NAME]) queueManager.initialize();
        
        // Remove old versions to prevent duplicates upon restart
        const repeatable = await queues[QUEUE_NAME].getRepeatableJobs();
        const existing = repeatable.find(j => j.name === name);
        if (existing) {
            await queues[QUEUE_NAME].removeRepeatableByKey(existing.key);
        }

        await queues[QUEUE_NAME].add(name, data, {
            repeat: { pattern }
        });
        logger.info(`⏰ Scheduled: ${name} (${pattern})`);
    },

    shutdown: async () => {
        await Promise.all(Object.values(queues).map(q => q.close()));
        logger.info('🛑 Queues Closed');
    }
};
