// apps/api/src/jobs/queue.ts
import { Queue } from 'bullmq';
import { config } from '../config';

// Standardized Queue Name
export const QUEUE_NAME = 'news-queue';

// Shared Queue Instance
// We use the redis connection config from your central config
export const newsQueue = new Queue(QUEUE_NAME, {
  connection: config.redis, // Ensure config.redis matches BullMQ connection requirements
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: 100, // Keep failed jobs for debugging
  },
});
