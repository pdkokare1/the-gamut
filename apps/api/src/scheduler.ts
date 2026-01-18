// apps/api/src/scheduler.ts
import cron from "node-cron";
import { articleProcessor } from "./services/articleProcessor";
import { clusterService } from "./services/clustering"; // We will build this next

/**
 * Initializes all background jobs.
 */
export const initScheduler = () => {
  console.log("⏰ Scheduler Initialized...");

  // 1. NEWS INGESTION (Every 30 minutes)
  // Staggered to avoid rate limits
  cron.schedule("*/30 * * * *", async () => {
    try {
      await articleProcessor.runIngestionPipeline("politics");
      await new Promise(r => setTimeout(r, 5000)); // 5s delay
      await articleProcessor.runIngestionPipeline("technology");
    } catch (e) {
      console.error("Job Error (Ingestion):", e);
    }
  });

  // 2. GENERAL NEWS (Hourly)
  cron.schedule("0 * * * *", async () => {
    try {
      await articleProcessor.runIngestionPipeline("general");
    } catch (e) {
      console.error("Job Error (General):", e);
    }
  });

  // 3. CLUSTERING / NARRATIVE FORMATION (Every 2 hours)
  // Groups new articles into "Narratives"
  cron.schedule("0 */2 * * *", async () => {
    try {
        console.log("Running Clustering...");
        // await clusterService.groupArticles(); // To be implemented in next step
    } catch (e) {
        console.error("Job Error (Clustering):", e);
    }
  });
};
