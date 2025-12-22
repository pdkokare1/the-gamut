// apps/api/src/jobs/processor.ts
import { Job } from 'bullmq';
import { prisma } from '@gamut/db';
import { newsQueue } from './queue';
import { newsService, NewsItem } from '../services/news';
import { aiService } from '../services/ai';
import { audioService } from '../services/audio';
import { gatekeeperService } from '../services/gatekeeper';

/**
 * JOB ROUTER
 * Routes different job types to their specific handlers.
 */
export const jobProcessor = async (job: Job) => {
  console.log(`⚡ Processing Job: ${job.name} (ID: ${job.id})`);

  switch (job.name) {
    case 'fetch-latest-news':
      return await handleFetch(job);
    case 'analyze-article':
      return await handleAnalysis(job);
    default:
      console.warn(`Unknown job name: ${job.name}`);
  }
};

/**
 * PHASE 1: FETCH
 * Fetches unique articles and queues them for analysis.
 */
const handleFetch = async (job: Job) => {
  // 1. Fetch raw unique news (Deduplicated by Redis in newsService)
  const uniqueArticles = await newsService.fetchLatest();
  
  if (uniqueArticles.length === 0) {
    console.log('No new unique articles found this cycle.');
    return { queued: 0 };
  }

  console.log(`Fetched ${uniqueArticles.length} unique articles. Queuing for analysis...`);

  // 2. Fan-out: Create a job for EACH article
  const jobs = uniqueArticles.map((article) => ({
    name: 'analyze-article',
    data: article,
    opts: {
      jobId: `analyze-${article.url}`, // Prevent duplicate jobs for same URL
    }
  }));

  await newsQueue.addBulk(jobs);

  return { queued: uniqueArticles.length };
};

/**
 * PHASE 2: ANALYZE
 * Deep processing of a single article.
 */
const handleAnalysis = async (job: Job) => {
  const item = job.data as NewsItem;

  try {
    // --- A. Gatekeeper Check ---
    // Fast fail if content is garbage
    if (!gatekeeperService.isValid(item.title, item.description || '', item.url)) {
      return { status: 'skipped', reason: 'gatekeeper_rejected' };
    }

    // --- B. DB Double Check ---
    // Just in case a race condition happened
    const exists = await prisma.article.findUnique({
      where: { url: item.url }
    });
    if (exists) return { status: 'skipped', reason: 'already_exists' };

    // --- C. AI Analysis ---
    console.log(`🤖 Analyzing: ${item.title}`);
    const fullText = `${item.title}. ${item.description || ''} ${item.content || ''}`;
    const analysis = await aiService.analyzeArticle(fullText, item.title);
    
    // --- D. Clustering Logic ---
    // Find if this belongs to an existing story from the last 24h
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
      // Attach to existing cluster
      clusterId = potentialMatch.clusterId;
      clusterTopic = potentialMatch.clusterTopic || clusterTopic;
      
      await prisma.narrative.update({
          where: { clusterId: clusterId },
          data: {
              lastUpdated: new Date(),
              sourceCount: { increment: 1 },
              sources: { push: item.source || "Unknown" }
          }
      });
    } else {
      // Create new cluster
      clusterId = Math.floor(Math.random() * 1000000);
      await prisma.narrative.create({
          data: {
              clusterId: clusterId,
              masterHeadline: item.title,
              executiveSummary: analysis.summary,
              category: analysis.category,
              country: "Global",
              sourceCount: 1,
              sources: [item.source || "Unknown"],
              consensusPoints: analysis.keyFindings || [],
              lastUpdated: new Date()
          }
      });
    }

    // --- E. Save Article ---
    const savedArticle = await prisma.article.create({
      data: {
        headline: item.title,
        url: item.url,
        summary: analysis.summary,
        imageUrl: item.imageUrl, // Fixed property name from item.urlToImage
        source: item.source || "Unknown",
        publishedAt: new Date(item.publishedAt),
        
        category: analysis.category || "General",
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

    // --- F. Audio Generation (Awaited) ---
    // We await this now to ensure the worker doesn't exit early
    if (savedArticle.id) {
       const audioUrl = await audioService.generateForArticle(savedArticle.id, analysis.summary, savedArticle.headline);
       if (audioUrl) {
           await prisma.article.update({
               where: { id: savedArticle.id },
               data: { audioUrl }
           });
       }
    }

    return { status: 'completed', id: savedArticle.id };

  } catch (err) {
    console.error(`❌ Analysis Failed for ${item.title}:`, err);
    throw err; // Throwing triggers BullMQ retry logic
  }
};
