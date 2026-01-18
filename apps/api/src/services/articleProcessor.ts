// apps/api/src/services/articleProcessor.ts
import { prisma } from "../utils/prisma";
import { newsService } from "./news";
import { aiService } from "./ai";

export const articleProcessor = {
  /**
   * Core Pipeline: Fetch -> Dedupe -> Analyze -> Save
   */
  async runIngestionPipeline(category: string = "general") {
    console.log(`Starting ingestion for: ${category}`);

    // 1. Fetch Raw Articles
    const rawArticles = await newsService.fetchHeadlines(category);
    console.log(`Fetched ${rawArticles.length} raw articles.`);

    let processedCount = 0;

    for (const raw of rawArticles) {
      // 2. Smart Deduplication
      // Check if URL exists OR if a very similar headline exists from same source
      const existing = await prisma.article.findFirst({
        where: {
          OR: [
            { url: raw.url },
            { 
              headline: raw.title,
              source: raw.source.name 
            }
          ]
        }
      });

      if (existing) {
        console.log(`Skipping duplicate: ${raw.title}`);
        continue;
      }

      // 3. AI Analysis (The Heavy Lifting)
      const analysis = await aiService.analyzeArticle(
        raw.title, 
        raw.description || raw.content || "", 
        raw.source.name
      );

      // 4. Vector Embedding (For Search/Clustering)
      const embedding = await aiService.generateEmbedding(
        `${raw.title} ${analysis.summary}`
      );

      // 5. Save to Database (Prisma)
      await prisma.article.create({
        data: {
          headline: raw.title,
          url: raw.url,
          imageUrl: raw.image,
          source: raw.source.name,
          publishedAt: new Date(raw.publishedAt),
          
          // AI Fields
          summary: analysis.summary,
          category: analysis.category || category, // Use AI category if available
          politicalLean: analysis.politicalLean,
          biasScore: analysis.biasScore,
          trustScore: analysis.trustScore,
          keyFindings: analysis.keyFindings,
          primaryNoun: analysis.primaryNoun,
          
          // Vector
          embedding: embedding,
          
          // Defaults
          isLatest: true,
          country: "us" // Default, can be dynamic later
        }
      });

      processedCount++;
    }

    console.log(`Pipeline finished. Saved ${processedCount} new articles.`);
    return processedCount;
  }
};
