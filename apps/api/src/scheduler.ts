// apps/api/src/scheduler.ts
import { newsQueue } from './jobs/queue';

export async function initScheduler() {
  console.log('⏰ Initializing Scheduler...');

  // Clean up old repeatable jobs to prevents duplicates on deployment
  const repeatableJobs = await newsQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await newsQueue.removeRepeatableByKey(job.key);
  }

  // Add the Master Cron Job
  // This job triggers the "Fetch" phase every hour
  await newsQueue.add(
    'fetch-latest-news',
    {}, 
    {
      repeat: {
        every: 60 * 60 * 1000, // 1 Hour
      },
    }
  );

  console.log('✅ Scheduler Active: Fetching news every 1 hour.');
}
