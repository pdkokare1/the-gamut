// apps/api/src/services/clustering.ts
import { prisma } from '@gamut/db';
import logger from '../utils/logger';
import redisHelper from '../utils/redis';

// Logic:
// 1. Vector Search for semantic similarity.
// 2. Time-based window (last 24-48h).
// 3. If match found -> assign same ClusterID.
// 4. If no match -> assign new ClusterID.

export const clusteringService = {
  
  async findClusterForArticle(embedding: number[], country: string = "Global"): Promise<{ clusterId: number; topic: string } | null> {
    if (!embedding || embedding.length === 0) return null;

    try {
      // Execute Raw Aggregation for Vector Search
      // Prisma doesn't strictly type raw commands, so we cast result
      const result = await prisma.$runCommandRaw({
        aggregate: "Article",
        pipeline: [
          {
            "$vectorSearch": {
              "index": "vector_index",
              "path": "embedding",
              "queryVector": embedding,
              "numCandidates": 50,
              "limit": 1,
              "filter": {
                "country": { "$eq": country }
              }
            }
          },
          {
            "$project": {
              "clusterId": 1,
              "clusterTopic": 1,
              "score": { "$meta": "vectorSearchScore" }
            }
          }
        ],
        cursor: {}
      }) as any;

      // Parse result (MongoDB returns { cursor: { firstBatch: [...] } })
      const matches = result.cursor?.firstBatch || [];
      const bestMatch = matches[0];

      // Threshold: 0.85 similarity implies same story
      if (bestMatch && bestMatch.score > 0.85) {
        return {
          clusterId: bestMatch.clusterId,
          topic: bestMatch.clusterTopic
        };
      }

    } catch (error: any) {
      logger.warn(`Vector Search Error: ${error.message}`);
    }

    return null;
  },

  async getNewClusterId(): Promise<number> {
    // Generate simple ID based on time + random to avoid collision
    // In production, Redis INCR is better, falling back to timestamp
    if (redisHelper.isReady()) {
      return await redisHelper.incr('GLOBAL_CLUSTER_ID');
    }
    return Math.floor(Date.now() / 1000);
  }
};
