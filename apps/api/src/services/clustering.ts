import { prisma } from "@repo/db";
import { redis } from "../utils/redis";
import logger from "../utils/logger";
import aiService from "./ai";
import { Prisma } from "@prisma/client";

// --- INTERFACES: Strict Type Definitions ---

// Represents the raw data coming back from MongoDB `findRaw`
interface IArticleRaw {
  _id: { $oid: string };
  headline: string;
  clusterId?: number;
  clusterTopic?: string;
  source?: string;
  category?: string;
  country?: string;
  publishedAt?: { $date: string };
  score?: number; // Vector search score
}

// Represents the AI service response
interface INarrativeAIResult {
  masterHeadline: string;
  executiveSummary: string;
  consensusPoints: string[];
  divergencePoints: { point: string; perspectives: { source: string; stance: string }[] }[];
}

// --- HELPER: Optimized String Similarity ---
// No changes needed, logic preserved from original
function getStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const s2 = str2.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 > len2) return getStringSimilarity(s2, s1);

  let prevRow = new Array(len1 + 1);
  let currRow = new Array(len1 + 1);

  for (let i = 0; i <= len1; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= len2; j++) {
    currRow[0] = j;
    for (let i = 1; i <= len1; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        currRow[i - 1] + 1,     // insertion
        prevRow[i] + 1,         // deletion
        prevRow[i - 1] + cost   // substitution
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  const distance = prevRow[len1];
  const maxLength = Math.max(len1, len2);

  return 1 - (distance / maxLength);
}

class ClusteringService {

  // --- Stage 1: Fast Fuzzy Match (Text Search) ---
  async findSimilarHeadline(headline: string): Promise<any | null> {
    if (!headline || headline.length < 5) return null;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      // Prisma `findRaw` requires EJSON format for Dates
      // This replicates: Article.find({ $text: ..., publishedAt: { $gte: ... } })
      const candidates = await prisma.article.findRaw({
        filter: {
          $text: { $search: headline },
          publishedAt: { $gte: { $date: oneDayAgo.toISOString() } }
        },
        options: {
          limit: 15,
          projection: { headline: 1, clusterId: 1, clusterTopic: 1 }
        }
      }) as unknown as IArticleRaw[];

      let bestMatch: IArticleRaw | null = null;
      let bestScore = 0;

      for (const candidate of candidates) {
        const score = getStringSimilarity(headline, candidate.headline);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }

      if (bestScore > 0.80 && bestMatch) {
        // Return object with normalized ID for Prisma usage
        return { ...bestMatch, id: bestMatch._id.$oid };
      }

    } catch (error: any) {
      logger.warn(`⚠️ Clustering Fuzzy Match warning: ${error.message}`);
    }

    return null;
  }

  // --- Stage 2: Vector Search (Semantic Duplicate) ---
  async findSemanticDuplicate(embedding: number[] | undefined, country: string): Promise<any | null> {
    if (!embedding || embedding.length === 0) return null;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      // Replicating MongoDB Aggregation Pipeline for Vector Search
      const pipeline: any[] = [
        {
          "$vectorSearch": {
            "index": "vector_index",
            "path": "embedding",
            "queryVector": embedding,
            "numCandidates": 10,
            "limit": 1,
            "filter": {
              "country": { "$eq": country }
            }
          }
        },
        {
          "$project": {
            "clusterId": 1, "headline": 1, "score": { "$meta": "vectorSearchScore" }
          }
        },
        // IMPORTANT: Ensure date is passed as EJSON for aggregation match
        { "$match": { "publishedAt": { "$gte": { $date: oneDayAgo.toISOString() } } } }
      ];

      const candidates = await prisma.article.findRaw({
        pipeline
      }) as unknown as IArticleRaw[];

      // Threshold check: 0.92 means almost identical meaning
      if (candidates.length > 0 && (candidates[0].score || 0) >= 0.92) {
        return { ...candidates[0], id: candidates[0]._id.$oid };
      }
    } catch (error) { /* Ignore vector errors during lookup */ }

    return null;
  }

  // --- Stage 3: Assign Cluster ID (Core Logic) ---
  async assignClusterId(newArticleData: any, embedding: number[] | undefined): Promise<number> {
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let finalClusterId = 0;

    // 1. Try Vector Matching (Broader search than strict duplicate)
    if (embedding && embedding.length > 0) {
      try {
        const pipeline: any[] = [
          {
            "$vectorSearch": {
              "index": "vector_index",
              "path": "embedding",
              "queryVector": embedding,
              "numCandidates": 50,
              "limit": 1,
              "filter": { "country": { "$eq": newArticleData.country } }
            }
          },
          { "$project": { "clusterId": 1, "score": { "$meta": "vectorSearchScore" } } },
          { "$match": { "publishedAt": { "$gte": { $date: sevenDaysAgo.toISOString() } } } }
        ];

        const candidates = await prisma.article.findRaw({ pipeline }) as unknown as IArticleRaw[];

        // Threshold 0.82: Similar topic, but not necessarily duplicate
        if (candidates.length > 0 && (candidates[0].score || 0) >= 0.82) {
          finalClusterId = candidates[0].clusterId || 0;
        }
      } catch (error) { /* Silent fallback */ }
    }

    // 2. Fallback: Exact Field Match (Topic + Category + Country)
    if (finalClusterId === 0 && newArticleData.clusterTopic) {
      const existingCluster = await prisma.article.findFirst({
        where: {
          clusterTopic: newArticleData.clusterTopic,
          category: newArticleData.category,
          country: newArticleData.country,
          publishedAt: { gte: sevenDaysAgo } // Prisma handles Date conversion in standard queries
        },
        orderBy: { publishedAt: 'desc' },
        select: { clusterId: true }
      });

      if (existingCluster && existingCluster.clusterId) {
        finalClusterId = existingCluster.clusterId;
      }
    }

    // 3. Generate NEW Cluster ID (Redis Sequence)
    if (finalClusterId === 0) {
      try {
        // Safe check for Redis readiness (handles both ioredis function and property styles)
        const isRedisReady = typeof redis.isReady === 'function' ? redis.isReady() : redis.isReady;

        if (isRedisReady) {
          let newId = await redis.incr('GLOBAL_CLUSTER_ID');

          // Gap Detection/Recovery Logic
          // If Redis restarts/wipes, we must ensure we don't reuse low IDs.
          if (newId < 100) {
            const maxIdDoc = await prisma.article.findFirst({
              orderBy: { clusterId: 'desc' },
              select: { clusterId: true }
            });
            const dbMax = maxIdDoc?.clusterId || 10000;

            if (dbMax >= newId) {
              await redis.set('GLOBAL_CLUSTER_ID', (dbMax + 1).toString());
              newId = dbMax + 1;
            }
          }
          finalClusterId = newId;
        } else {
          // Fallback if Redis is down: use timestamp (pseudo-unique)
          finalClusterId = Math.floor(Date.now() / 1000);
        }
      } catch (err) {
        finalClusterId = Math.floor(Date.now() / 1000);
      }
    }

    // --- Fire and Forget: Check if Narrative needs update ---
    // We purposefully do not await this to keep article ingestion fast
    setTimeout(() => {
      this.processClusterForNarrative(finalClusterId).catch(err => {
        logger.warn(`Background Narrative Gen Error for Cluster ${finalClusterId}: ${err.message}`);
      });
    }, 5000);

    return finalClusterId;
  }

  // --- Stage 3.5: Feed Optimization (Prisma Transaction) ---
  // Ensures only the newest article in a cluster is flagged as 'isLatest: true'
  async optimizeClusterFeed(clusterId: number): Promise<void> {
    if (!clusterId || clusterId === 0) return;

    try {
      const articles = await prisma.article.findMany({
        where: { clusterId },
        orderBy: { publishedAt: 'desc' },
        select: { id: true }
      });

      if (articles.length <= 1) return;

      const latestId = articles[0].id;
      const olderIds = articles.slice(1).map(a => a.id);

      // Execute as a single atomic transaction
      await prisma.$transaction([
        prisma.article.update({ where: { id: latestId }, data: { isLatest: true } }),
        prisma.article.updateMany({
          where: { id: { in: olderIds } },
          data: { isLatest: false }
        })
      ]);

      logger.info(`🧹 Cluster ${clusterId} Optimized: 1 Visible, ${olderIds.length} Hidden`);

    } catch (error: any) {
      logger.warn(`Optimization failed for cluster ${clusterId}: ${error.message}`);
    }
  }

  // --- Stage 4: Narrative Synthesis (The "Brain") ---
  async processClusterForNarrative(clusterId: number): Promise<void> {
    // 1. Check if we already have a recent narrative (12 hours cache)
    const existingNarrative = await prisma.narrative.findUnique({
      where: { clusterId }
    });

    if (existingNarrative) {
      const hoursOld = (Date.now() - new Date(existingNarrative.lastUpdated).getTime()) / (1000 * 60 * 60);
      if (hoursOld < 12) return; // Skip if fresh
    }

    // 2. Fetch Top 10 Articles in Cluster
    const articles = await prisma.article.findMany({
      where: { clusterId },
      orderBy: { publishedAt: 'desc' },
      take: 10
    });

    // 3. Strict Quality Thresholds
    // Need at least 3 articles from 3 distinct sources to warrant a "Narrative"
    if (articles.length < 3) return;
    const distinctSources = new Set(articles.map(a => a.source));
    if (distinctSources.size < 3) return;

    logger.info(`🧠 Triggering Narrative Synthesis for Cluster ${clusterId} (${articles.length} arts, ${distinctSources.size} srcs)...`);

    // 4. Generate Content via AI Service
    // Casting to any allowed here assuming aiService handles the Prism type
    const narrativeData = await aiService.generateNarrative(articles as any) as INarrativeAIResult;

    if (narrativeData) {
      // 5. Upsert Narrative (Create or Update)
      // Uses standard Prisma upsert to avoid race conditions
      await prisma.narrative.upsert({
        where: { clusterId },
        update: {
          lastUpdated: new Date(),
          masterHeadline: narrativeData.masterHeadline,
          executiveSummary: narrativeData.executiveSummary,
          consensusPoints: narrativeData.consensusPoints,
          divergencePoints: narrativeData.divergencePoints, // Prisma schema supports JSON/Composite types
          sourceCount: articles.length,
          sources: Array.from(distinctSources),
          category: articles[0].category,
          country: articles[0].country
        },
        create: {
          clusterId,
          lastUpdated: new Date(),
          masterHeadline: narrativeData.masterHeadline,
          executiveSummary: narrativeData.executiveSummary,
          consensusPoints: narrativeData.consensusPoints,
          divergencePoints: narrativeData.divergencePoints,
          sourceCount: articles.length,
          sources: Array.from(distinctSources),
          category: articles[0].category || "General",
          country: articles[0].country || "Global"
        }
      });
      logger.info(`✅ Narrative Generated for Cluster ${clusterId}`);
    }
  }
}

export default new ClusteringService();
