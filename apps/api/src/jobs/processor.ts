import { Job } from 'bullmq';
import { prisma } from '@gamut/db';
import { newsService } from '../services/news';
import { aiService } from '../services/ai';
import { audioService } from '../services/audio';
import { gatekeeperService } from '../services/gatekeeper'; // New Import

export const processNewsJob = async (job: Job) => {
  console.log(`Starting Job: ${job.name}`);

  // 1. Fetch raw news
  const rawArticles = await newsService.fetchLatest();
  console.log(`Fetched ${rawArticles.length} raw articles.`);

  let newCount = 0;
  let updatedClusters = 0;

  for (const item of rawArticles) {
    try {
      // --- A. Gatekeeper Check (New) ---
      // Skip if content is low quality or spam
      if (!gatekeeperService.isValid(item.title, item.description || '', item.url)) {
        continue;
      }

      // --- B. Duplicate Check ---
      const exists = await prisma.article.findUnique({
        where: { url: item.url }
      });

      if (exists) continue;

      // --- C. AI Analysis ---
      const fullText = `${item.title}. ${item.description || ''} ${item.content || ''}`;
      const analysis = await aiService.analyzeArticle(fullText, item.title);
      
      // --- D. Clustering Logic ---
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let clusterId: number | null = null;
      let clusterTopic = analysis.primaryNoun || "General";

      const potentialMatch = await prisma.article.findFirst({
        where: {
          publishedAt: { gte: twentyFourHoursAgo },
          category: analysis.category,
          primaryNoun: analysis.primaryNoun,
          clusterId: { not: null }
        },
        orderBy: { publishedAt: 'desc' }
      });

      if (potentialMatch && potentialMatch.clusterId) {
        clusterId = potentialMatch.clusterId;
        clusterTopic = potentialMatch.clusterTopic || clusterTopic;
        updatedClusters++;
        
        await prisma.narrative.update({
            where: { clusterId: clusterId },
            data: {
                lastUpdated: new Date(),
                sourceCount: { increment: 1 },
                sources: { push: item.source.name || "Unknown" }
            }
        }).catch(e => console.log("Narrative update warning:", e.message));

      } else {
        clusterId = Math.floor(Math.random() * 1000000);
        await prisma.narrative.create({
            data: {
                clusterId: clusterId,
                masterHeadline: item.title,
                executiveSummary: analysis.summary,
                category: analysis.category,
                country: "Global",
                sourceCount: 1,
                sources: [item.source.name || "Unknown"],
                consensusPoints: analysis.keyFindings || [],
                lastUpdated: new Date()
            }
        }).catch(e => console.log("Narrative creation warning:", e.message));
      }

      // --- E. Save Article ---
      const savedArticle = await prisma.article.create({
        data: {
          headline: item.title,
          url: item.url,
          summary: analysis.summary,
          imageUrl: item.urlToImage,
          source: item.source.name || "Unknown",
          publishedAt: new Date(item.publishedAt),
          
          category: analysis.category,
          politicalLean: analysis.politicalLean,
          sentiment: analysis.sentiment,
          biasScore: analysis.biasScore,
          trustScore: analysis.trustScore,
          keyFindings: analysis.keyFindings || [],
          
          clusterId: clusterId,
          clusterTopic: clusterTopic,
          primaryNoun: analysis.primaryNoun,
          
          coverageLeft: 0,
          coverageCenter: 0,
          coverageRight: 0
        }
      });

      // --- F. Audio Generation ---
      audioService.generateForArticle(savedArticle.id, analysis.summary, savedArticle.headline)
        .then(async (audioUrl) => {
            if (audioUrl) {
                await prisma.article.update({
                    where: { id: savedArticle.id },
                    data: { audioUrl }
                });
            }
        })
        .catch(err => console.error("Audio gen background error:", err));

      newCount++;
    } catch (err) {
      console.error(`Failed to process article: ${item.title}`, err);
    }
  }

  console.log(`Job Complete. Processed ${newCount} new articles.`);
  return { processed: newCount, clustersUpdated: updatedClusters };
};
