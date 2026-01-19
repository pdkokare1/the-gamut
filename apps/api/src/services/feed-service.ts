// apps/api/src/services/feed-service.ts
import { prisma } from '@gamut/db';
import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { redis } from '../utils/redis'; // Assuming you have a redis utility
import { aiService } from './ai'; // Assuming this exists for embeddings

// Types
interface FeedFilters {
  limit: number;
  cursor?: string | null;
  category?: string;
  politicalLean?: string;
  country?: string;
  topic?: string;
}

// Helper: Cosine Similarity
const calculateSimilarity = (vecA: number[], vecB: number[]) => {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const feedService = {
  
  // =================================================================
  // 1. MAIN FEED (Weighted & Personalized)
  // =================================================================
  async getWeightedFeed(filters: FeedFilters, userProfile?: any) {
    const { limit, cursor, category, politicalLean, topic } = filters;

    // 1. Build Base Query
    const where: Prisma.ArticleWhereInput = {
       publishedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } // Last 48h default
    };

    if (cursor) {
        where.id = { lt: cursor }; // Pagination (Cursor based)
    }

    if (category) where.category = category;
    if (politicalLean) where.politicalLean = politicalLean;
    
    // InFocus Topic Filter (Regex-like search)
    if (topic) {
         const cleanTopic = topic.replace(/[^\w\s]/g, '').replace(/\s+/g, '.*');
         where.OR = [
             { clusterTopic: { equals: topic, mode: 'insensitive' } },
             { clusterTopic: { contains: cleanTopic, mode: 'insensitive' } }
         ];
         // Remove 48h limit for specific topics to show full history
         delete where.publishedAt;
    }

    // 2. Fetch Candidates (Fetch more than limit to allow re-ranking)
    const candidates = await prisma.article.findMany({
        where,
        take: 80, 
        orderBy: { publishedAt: 'desc' },
        include: {
            // Only fetch strictly necessary fields for feed
            // We avoid fetching 'content' to save bandwidth
            savedByProfiles: userProfile ? { where: { id: userProfile.id } } : false
        }
    });

    // 3. Scoring Logic (Re-implementation of Narrative's weighting)
    const scoredCandidates = candidates.map((article) => {
        let score = 0;
        
        // A. Recency Score
        const hoursOld = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60);
        score += Math.max(0, 40 - (hoursOld * 1.5));

        // B. Quality Modifiers
        if (article.trustScore > 85) score += 10;
        if (article.biasScore < 15) score += 5; 
        if (article.isLatest) score += 10; // Prefer latest version of a story

        // C. Personalization (Vector Similarity)
        if (userProfile?.userEmbedding && article.embedding.length > 0) {
            const sim = calculateSimilarity(userProfile.userEmbedding, article.embedding);
            score += Math.max(0, (sim - 0.5) * 100); 
        }

        return { article, score };
    });

    // 4. Sort & Zone
    const sorted = scoredCandidates.sort((a, b) => b.score - a.score);

    // Zone 1: Top 10 High Score
    const zone1 = sorted.slice(0, 10).map(i => i.article);
    
    // Zone 2: Discovery (Randomized from next 20)
    const zone2Candidates = sorted.slice(10, 30);
    const zone2 = zone2Candidates
        .map(i => i.article)
        .sort(() => Math.random() - 0.5);

    const merged = [...zone1, ...zone2].slice(0, limit);

    return merged.map(article => ({
        ...article,
        isSaved: userProfile ? article.savedByProfiles.length > 0 : false
    }));
  },

  // =================================================================
  // 2. IN FOCUS (Narratives)
  // =================================================================
  async getInFocusNarratives(limit: number) {
      // Fetch Narratives directly
      const narratives = await prisma.narrative.findMany({
          orderBy: { lastUpdated: 'desc' },
          take: limit,
          select: {
              id: true,
              masterHeadline: true,
              clusterId: true,
              lastUpdated: true,
              sourceCount: true,
              consensusPoints: true,
              // No vector data
          }
      });
      return narratives;
  },

  // =================================================================
  // 3. BALANCED FEED (Anti-Echo Chamber)
  // =================================================================
  async getBalancedFeed(userProfile: any, limit: number) {
      if (!userProfile) return [];

      // Fetch User Stats to know their bias
      const stats = await prisma.userStats.findUnique({
          where: { userId: userProfile.userId }
      });

      let targetLean: string[] = [];
      let reason = "Global Perspectives";

      if (stats?.leanExposure) {
          const { Left, Right, Center } = stats.leanExposure;
          const total = Left + Right + Center;

          if (total > 50) { // Only apply if we have enough data
               if (Left > Right * 1.5) {
                   targetLean = ['Right', 'Right-Leaning', 'Center'];
                   reason = "Perspectives from Center & Right";
               } else if (Right > Left * 1.5) {
                   targetLean = ['Left', 'Left-Leaning', 'Center'];
                   reason = "Perspectives from Center & Left";
               }
          }
      }

      if (targetLean.length === 0) return []; // No strong bias detected

      const articles = await prisma.article.findMany({
          where: {
              politicalLean: { in: targetLean },
              publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
              trustScore: { gte: 70 } // Only high trust for balanced feed
          },
          orderBy: { trustScore: 'desc' },
          take: limit
      });

      return articles.map(a => ({ ...a, suggestionType: 'Challenge', reason }));
  },

  // =================================================================
  // 4. INTELLIGENT SEARCH (Vector + Fallback)
  // =================================================================
  async smartSearch(query: string) {
     if (!query) return [];

     // 1. Try Vector Search (Raw MongoDB Command via Prisma)
     try {
         const embedding = await aiService.createEmbedding(query);
         
         // Prisma doesn't support $vectorSearch natively yet in typed query
         // We use runCommandRaw
         if (embedding) {
            const rawResult = await prisma.$runCommandRaw({
                aggregate: "articles",
                pipeline: [
                    {
                        "$vectorSearch": {
                            "index": "vector_index",
                            "path": "embedding",
                            "queryVector": embedding,
                            "numCandidates": 100,
                            "limit": 20
                        }
                    },
                    {
                        "$project": {
                            "_id": 1, "headline": 1, "summary": 1, "category": 1,
                            "politicalLean": 1, "imageUrl": 1, "publishedAt": 1,
                            "trustScore": 1
                        }
                    }
                ],
                cursor: {} 
            });

            // Parse Raw Result (MongoDB returns distinct structure)
            const hits = (rawResult as any).cursor?.firstBatch || [];
            if (hits.length > 0) return hits;
         }
     } catch (e) {
         console.warn("Vector search failed, falling back to text:", e);
     }

     // 2. Fallback: Text Search (Regex/Index)
     // Note: Atlas Search would be better here, but simple regex works for fallback
     return await prisma.article.findMany({
         where: {
             OR: [
                 { headline: { contains: query, mode: 'insensitive' } },
                 { summary: { contains: query, mode: 'insensitive' } }
             ]
         },
         take: 20,
         orderBy: { publishedAt: 'desc' }
     });
  },

  // =================================================================
  // 5. TOGGLE SAVE
  // =================================================================
  async toggleSaveArticle(userId: string, articleId: string) {
      const profile = await prisma.profile.findUnique({
          where: { userId },
          include: { savedArticles: true }
      });

      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });

      const isSaved = profile.savedArticles.some(a => a.id === articleId);

      if (isSaved) {
          await prisma.profile.update({
              where: { userId },
              data: {
                  savedArticles: { disconnect: { id: articleId } }
              }
          });
          return { saved: false };
      } else {
          await prisma.profile.update({
              where: { userId },
              data: {
                  savedArticles: { connect: { id: articleId } }
              }
          });
          return { saved: true };
      }
  },

  // =================================================================
  // 6. TRENDING TOPICS (Replaces getTrendingTopics)
  // =================================================================
  async getTrendingTopics(limit: number = 8) {
      // Aggregate by clusterTopic
      const groups = await prisma.article.groupBy({
          by: ['clusterTopic'],
          where: {
              publishedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }, // Last 48h
              clusterTopic: { not: null }
          },
          _count: {
              clusterTopic: true
          },
          orderBy: {
              _count: {
                  clusterTopic: 'desc'
              }
          },
          take: limit
      });

      // Filter out nulls and empty strings if any slipped through
      return groups
          .filter(g => g.clusterTopic && g.clusterTopic.length > 2)
          .map(g => ({
              topic: g.clusterTopic,
              count: g._count.clusterTopic
          }));
  },

  // =================================================================
  // 7. GET SAVED ARTICLES (Replaces getSavedArticles)
  // =================================================================
  async getSavedArticles(userId: string) {
      const profile = await prisma.profile.findUnique({
          where: { userId },
          include: {
              savedArticles: {
                  orderBy: { publishedAt: 'desc' }
              }
          }
      });

      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
      
      return profile.savedArticles.map(article => ({
          ...article,
          isSaved: true
      }));
  },

  // =================================================================
  // 8. SMART BRIEFING (Replaces getSmartBriefing)
  // =================================================================
  async getSmartBriefing(articleId: string) {
      const article = await prisma.article.findUnique({
          where: { id: articleId },
          select: {
              headline: true,
              summary: true,
              keyFindings: true,
              recommendations: true,
              trustScore: true,
              politicalLean: true,
              source: true
          }
      });

      if (!article) throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });

      const points = (article.keyFindings && article.keyFindings.length > 0)
          ? article.keyFindings
          : ["Analysis in progress. Key findings will appear shortly."];

      const recommendations = (article.recommendations && article.recommendations.length > 0)
          ? article.recommendations
          : ["Follow this topic for updates.", "Compare sources to verify details."];

      return {
          title: article.headline,
          content: article.summary,
          keyPoints: points,
          recommendations: recommendations,
          meta: {
              trustScore: article.trustScore,
              politicalLean: article.politicalLean,
              source: article.source
          }
      };
  },

  // =================================================================
  // 9. ADMIN CRUD OPERATIONS
  // =================================================================
  async createArticle(data: any) {
      return await prisma.article.create({ data });
  },

  async updateArticle(id: string, data: any) {
      return await prisma.article.update({
          where: { id },
          data
      });
  },

  async deleteArticle(id: string) {
      return await prisma.article.delete({ where: { id } });
  }
};
