// apps/api/src/jobs/worker.ts
import { Worker, Job } from 'bullmq';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../utils/constants';
import { redis } from '../utils/redis';
import path from 'path';

let newsWorker: Worker | null = null;

export const startWorker = () => {
    if (!redis) {
        logger.error("❌ Cannot start worker: Redis not configured.");
        return;
    }
    if (newsWorker) {
        logger.warn("⚠️ Worker already running.");
        return;
    }

    try {
        // Point to the processor file for sandboxed execution
        const processorPath = path.join(__dirname, 'processor.ts');

        newsWorker = new Worker(CONSTANTS.QUEUE.NAME || 'news-queue', processorPath, { 
            connection: redis,
            concurrency: 1, // Strict concurrency as requested
            
            // CRITICAL: 5 Minutes Lock Duration
            // Ensures massive batch embedding jobs don't timeout
            lockDuration: 300000, 
            
            // Retry settings
            maxStalledCount: 3, 
        });

        // --- Event Listeners ---
        newsWorker.on('completed', (job: Job) => {
            logger.info(`✅ Job ${job.id} (${job.name}) completed successfully.`);
        });

        newsWorker.on('failed', (job: Job | undefined, err: Error) => {
            logger.error(`🔥 Job ${job?.id || 'unknown'} (${job?.name}) failed: ${err.message}`);
        });
        
        newsWorker.on('error', (err) => {
             logger.error(`⚠️ Worker Connection Error: ${err.message}`);
        });

        newsWorker.on('ready', () => {
            logger.info("✅ Worker is READY and processing.");
        });

        logger.info(`✅ Background Worker Started (Queue: ${CONSTANTS.QUEUE.NAME}, Concurrency: 1, Lock: 5m)`);

    } catch (err: any) {
        logger.error(`❌ Failed to start Worker: ${err.message}`);
    }
};

export const shutdownWorker = async () => {
    if (newsWorker) {
        logger.info('🛑 Shutting down Worker...');
        try {
            await newsWorker.close();
            logger.info('✅ Worker shutdown complete.');
        } catch (err: any) {
            logger.error(`⚠️ Error shutting down worker: ${err.message}`);
        }
    }
};
