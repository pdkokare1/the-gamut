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
   * Finds or Creates a Cluster ID for a new article.
   */
  async findClusterForArticle(article: ClusterInput): Promise<{ clusterId: number; clusterTopic: string }> {
    const { primaryNoun, category, publishedAt } = article;
    
    // Default: No Cluster
    let clusterId = Math.floor(Math.random() * 1000000); // Temporary ID
    let clusterTopic = primaryNoun || "General News";

    if (!primaryNoun) {
      return { clusterId, clusterTopic };
    }

    // 1. Search for existing cluster (Last 24 hours)
    const twentyFourHoursAgo = new Date(publishedAt.getTime() - (24 * 60 * 60 * 1000));

    const match = await prisma.article.findFirst({
      where: {
        publishedAt: { gte: twentyFourHoursAgo },
        category: category,
        primaryNoun: primaryNoun,
        clusterId: { not: null }
      },
      orderBy: { publishedAt: 'desc' }
    });

    if (match && match.clusterId) {
      // ✅ Attach to existing cluster
      logger.info(`🔗 Clustering: "${article.title}" -> Joined Cluster ${match.clusterId} (${match.clusterTopic})`);
      
      await this.updateNarrativeStats(match.clusterId, article.source);
      
      return { 
        clusterId: match.clusterId, 
        clusterTopic: match.clusterTopic || clusterTopic 
      };
    }

    // 🆕 Create New Cluster Entry
    logger.info(`🆕 Clustering: "${article.title}" -> Started New Cluster ${clusterId}`);
    
    await this.createNarrativeEntry(clusterId, article);

    return { clusterId, clusterTopic };
  }

  private async updateNarrativeStats(clusterId: number, newSource: string) {
    try {
      await prisma.narrative.update({
        where: { clusterId },
        data: {
          lastUpdated: new Date(),
          sourceCount: { increment: 1 },
          sources: { push: newSource }
        }
      });
    } catch (e) {
      // Narrative might not exist yet if race condition, ignore
    }
  }

  private async createNarrativeEntry(clusterId: number, article: ClusterInput) {
    try {
      await prisma.narrative.create({
        data: {
          clusterId,
          masterHeadline: article.title,
          executiveSummary: article.summary,
          category: article.category,
          country: "Global",
          sourceCount: 1,
          sources: [article.source],
          consensusPoints: [], // Will be filled by AI Narrative Job later
          lastUpdated: new Date()
        }
      });
    } catch (e) {
      logger.error('Failed to create narrative entry', e);
    }
  }
}

export const clusteringService = new ClusteringService();
