// apps/api/src/scheduler.ts
import cron from "node-cron";
import { newsService } from "./services/news-service";
import clusteringService from "./services/clustering";

/**
 * Initializes all background jobs.
 */
export const initScheduler = () => {
  console.log("⏰ Scheduler Initialized...");

  // 1. NEWS INGESTION (Every 15 minutes)
  // Matches the rhythm of the old backend
  cron.schedule("*/15 * * * *", async () => {
    try {
        await newsService.fetchAndProcessNews();
    } catch (e) {
        console.error("Job Error (Ingestion):", e);
    }
  });

  // 2. CLUSTERING / NARRATIVE FORMATION (Every 2 hours)
  // Groups new articles into "Narratives" and ensures data consistency
  cron.schedule("0 */2 * * *", async () => {
    try {
        console.log("Running Scheduled Clustering Optimization...");
        // In a real scenario, you might iterate over active clusters
        // For now, this acts as a placeholder or can call specific optimization routines
    } catch (e) {
        console.error("Job Error (Clustering):", e);
    }
  });
};
