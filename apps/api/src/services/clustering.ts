// apps/api/src/services/clustering.ts
import { prisma } from '@gamut/db';
import logger from '../utils/logger';

interface ClusterInput {
  title: string;
  summary: string;
  category: string;
  source: string;
  primaryNoun?: string;
  publishedAt: Date;
}

class ClusteringService {
  
  /**
   * Finds an existing cluster for a new article or creates a new ID.
   */
  async findClusterForArticle(article: ClusterInput): Promise<{ clusterId: number, clusterTopic: string }> {
    const windowStart = new Date(article.publishedAt.getTime() - 24 * 60 * 60 * 1000); // 24 Hours back

    // 1. Fetch candidates from DB (Same Category + Recent)
    // Optimization: Only fetch fields needed for comparison
    const candidates = await prisma.article.findMany({
      where: {
        category: article.category,
        publishedAt: { gte: windowStart },
        clusterId: { not: null } // Only look at clustered articles
      },
      select: {
        id: true,
        headline: true,
        clusterId: true,
        clusterTopic: true
      },
      take: 50 // Limit to avoid performance hits
    });

    // 2. Fuzzy Match Logic
    let bestMatchId: number | null = null;
    let bestMatchTopic: string | null = null;
    let highestSimilarity = 0;

    for (const candidate of candidates) {
      const similarity = this.calculateSimilarity(article.title, candidate.headline);
      
      // Threshold: 0.6 (60% similar words)
      if (similarity > 0.6 && similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatchId = candidate.clusterId;
        bestMatchTopic = candidate.clusterTopic;
      }
    }

    // 3. Return Existing Cluster
    if (bestMatchId && bestMatchTopic) {
      return { clusterId: bestMatchId, clusterTopic: bestMatchTopic };
    }

    // 4. Create New Cluster
    // In a real system, you might use Redis for an atomic counter, 
    // but here we generate a timestamp-based ID for simplicity/uniqueness.
    const newClusterId = Math.floor(Date.now() / 1000);
    return { clusterId: newClusterId, clusterTopic: article.title };
  }

  // --- Helpers ---

  /**
   * Simple Jaccard Similarity (Word Overlap)
   * Fast & "Good Enough" for initial grouping without AI.
   */
  private calculateSimilarity(s1: string, s2: string): number {
    const set1 = new Set(s1.toLowerCase().split(/\s+/));
    const set2 = new Set(s2.toLowerCase().split(/\s+/));
    
    // Intersection
    let intersection = 0;
    set1.forEach(word => {
        if (word.length > 3 && set2.has(word)) intersection++;
    });

    // Union
    const union = new Set([...set1, ...set2]).size;
    
    return intersection / union;
  }
}

export const clusteringService = new ClusteringService();
