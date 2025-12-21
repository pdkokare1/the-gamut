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

  for (const item of rawArticles) {
    // 2. Duplicate Check
    const exists = await prisma.article.findUnique({
      where: { url: item.url }
    });

    if (exists) continue;

    // 3. AI Analysis
    // We combine title + desc for better context
    const fullText = `${item.title}. ${item.description || ''} ${item.content || ''}`;
    const analysis = await aiService.analyzeArticle(fullText, item.title);
    const embedding = await aiService.generateEmbedding(item.title);

    // 4. Save to DB
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
        keyFindings: analysis.keyFindings,
        
        // Vector
        embedding: embedding,
        
        // Defaults
        coverageLeft: 0,
        coverageCenter: 0,
        coverageRight: 0
      }
    });

    newCount++;
  }

  console.log(`Job Complete. Processed ${newCount} new articles.`);
  return { processed: newCount };
};
