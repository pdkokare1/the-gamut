import { Worker } from 'bullmq';
import { config, redis } from './config';
import { processNewsJob } from './jobs/processor';

const WORKER_NAME = 'news-worker';

console.log('👷 Worker Service Starting...');

const worker = new Worker(WORKER_NAME, processNewsJob, {
  connection: redis,
  concurrency: 1, // Process one job at a time to respect API rate limits
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  console.log('Worker shutting down...');
  await worker.close();
  process.exit(0);
});
