// apps/api/src/worker.ts
import { Worker } from 'bullmq';
import { config } from './config';
import { QUEUE_NAME } from './jobs/queue';
import { jobProcessor } from './jobs/processor';

console.log('👷 Worker Service Starting...');

// Initialize Worker
// It listens to the same queue name as the scheduler
const worker = new Worker(QUEUE_NAME, jobProcessor, {
  connection: config.redis,
  concurrency: 5, // We can now process 5 articles in parallel!
});

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} (${job.name}) completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} (${job?.name}) failed:`, err);
});

// Graceful Shutdown
const gracefulShutdown = async () => {
  console.log('Worker shutting down...');
  await worker.close();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
