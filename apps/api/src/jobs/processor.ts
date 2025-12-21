import { Job } from 'bullmq';
import { prisma } from '@gamut/db';
import { newsService } from '../services/news';
import { aiService } from '../services/ai';

export const processNewsJob = async (job: Job) => {
  console.log(`Starting Job: ${job.name}`);

  // 1. Fetch raw news
  const rawArticles = await newsService.fetchLatest();
  console.log(`Fetched ${rawArticles.length} raw articles.`);

  let newCount = 0;
  let updatedClusters = 0;

  for (const item of rawArticles) {
    try {
      // --- A. Duplicate Check ---
      const exists = await prisma.article.findUnique({
        where: { url: item.url }
      });

      if (exists) continue;

      // --- B. AI Analysis ---
      // We combine title + desc for better context
      const fullText = `${item.title}. ${item.description || ''} ${item.content || ''}`;
      
      // Note: Assumes aiService returns: { summary, category, politicalLean, sentiment, biasScore, trustScore, primaryNoun, ... }
      const analysis = await aiService.analyzeArticle(fullText, item.title);
      
      // --- C. Clustering Logic (The "Smart" Part) ---
      // Try to find a matching cluster from the last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      let clusterId: number | null = null;
      let clusterTopic = analysis.primaryNoun || "General";

      // Find potential matches based on Category + Noun overlap
      // This is a simplified "in-memory" clustering to avoid heavy vector DB setup for now
      const potentialMatch = await prisma.article.findFirst({
        where: {
          publishedAt: { gte: twentyFourHoursAgo },
          category: analysis.category,
          primaryNoun: analysis.primaryNoun, // Strict noun match
          clusterId: { not: null }
        },
        orderBy: { publishedAt: 'desc' }
      });

      if (potentialMatch && potentialMatch.clusterId) {
        // MATCH FOUND: Join existing cluster
        clusterId = potentialMatch.clusterId;
        clusterTopic = potentialMatch.clusterTopic || clusterTopic;
        updatedClusters++;
        
        // Update the "Narrative" (The master story container)
        await prisma.narrative.update({
            where: { clusterId: clusterId },
            data: {
                lastUpdated: new Date(),
                sourceCount: { increment: 1 },
                sources: { push: item.source.name || "Unknown" }
            }
        }).catch(e => console.log("Narrative update warning:", e.message));

      } else {
        // NO MATCH: Create new Cluster
        // Generate a random ID for the cluster (simple integer for indexing)
        clusterId = Math.floor(Math.random() * 1000000);
        
        // Create the initial Narrative for this new topic
        await prisma.narrative.create({
            data: {
                clusterId: clusterId,
                masterHeadline: item.title, // Initially matches the first article
                executiveSummary: analysis.summary, // Initially matches the first article
                category: analysis.category,
                country: "Global",
                sourceCount: 1,
                sources: [item.source.name || "Unknown"],
                consensusPoints: analysis.keyFindings || [],
                lastUpdated: new Date()
            }
        }).catch(e => console.log("Narrative creation warning:", e.message));
      }

      // --- D. Save Article to DB ---
      await prisma.article.create({
        data: {
          headline: item.title,
          url: item.url,
          summary: analysis.summary,
          imageUrl: item.urlToImage,
          source: item.source.name || "Unknown",
          publishedAt: new Date(item.publishedAt),
          
          // AI Fields
          category: analysis.category,
          politicalLean: analysis.politicalLean,
          sentiment: analysis.sentiment,
          biasScore: analysis.biasScore,
          trustScore: analysis.trustScore,
          keyFindings: analysis.keyFindings || [],
          
          // Clustering Fields
          clusterId: clusterId,
          clusterTopic: clusterTopic,
          primaryNoun: analysis.primaryNoun,
          
          // Defaults
          coverageLeft: 0,
          coverageCenter: 0,
          coverageRight: 0
        }
      });

      newCount++;
    } catch (err) {
      console.error(`Failed to process article: ${item.title}`, err);
    }
  }

  console.log(`Job Complete. Processed ${newCount} new articles. Updated ${updatedClusters} clusters.`);
  return { processed: newCount, clustersUpdated: updatedClusters };
};
