import { Queue } from 'bullmq';
import { config, redis } from './config';

const newsQueue = new Queue('news-queue', { connection: redis });

export async function initScheduler() {
  console.log('⏰ Initializing Scheduler...');

  // Remove old repeatable jobs to avoid duplicates on restart
  const repeatableJobs = await newsQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await newsQueue.removeRepeatableByKey(job.key);
  }

  // Add the recurring job (Runs every 1 hour)
  await newsQueue.add(
    'fetch-latest-news',
    {}, 
    {
      repeat: {
        every: 60 * 60 * 1000, // 1 Hour
      },
      removeOnComplete: true, // Keep Redis clean
      removeOnFail: 50 // Keep last 50 failed jobs for debugging
    }
  );

  console.log('✅ Scheduler Active: Fetching news every 1 hour.');
}
