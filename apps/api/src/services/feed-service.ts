// apps/api/src/services/feed-service.ts
import { prisma } from "../utils/prisma"; // Assumes you have a prisma instance exported
import { Prisma } from "@prisma/client";

interface FeedFilters {
  limit: number;
  cursor?: string | null;
  category?: string;
  politicalLean?: string;
  country?: string;
  topic?: string;
}

export const feedService = {
  /**
   * 1. MAIN FEED ALGORITHM
   * Applies filters, handles infinite scroll, and ensures only latest versions are shown.
   */
  async getWeightedFeed(filters: FeedFilters, userProfile: any) {
    const { limit, cursor, category, politicalLean, country, topic } = filters;

    const where: Prisma.ArticleWhereInput = {
      isLatest: true, // Only show latest version
    };

    if (category) where.category = category;
    if (politicalLean) where.politicalLean = politicalLean;
    if (country && country !== "Global") where.country = country;
    if (topic) where.clusterTopic = { contains: topic, mode: "insensitive" };

    // Fetch articles
    const articles = await prisma.article.findMany({
      take: limit + 1, // Fetch one extra to determine next cursor
      cursor: cursor ? { id: cursor } : undefined,
      where,
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        headline: true,
        summary: true,
        source: true,
        category: true,
        politicalLean: true,
        imageUrl: true,
        audioUrl: true,
        publishedAt: true,
        trustScore: true,
        biasScore: true,
        coverageLeft: true,
        coverageCenter: true,
        coverageRight: true,
        clusterTopic: true,
      }
    });

    return articles;
  },

  /**
   * 2. IN FOCUS (NARRATIVES)
   * Fetches top-level narratives that group multiple articles.
   */
  async getInFocusNarratives(limit: number) {
    return await prisma.narrative.findMany({
      take: limit,
      orderBy: { lastUpdated: "desc" },
      select: {
        id: true,
        masterHeadline: true,
        executiveSummary: true,
        clusterId: true,
        sourceCount: true,
        category: true,
        lastUpdated: true,
      }
    });
  },

  /**
   * 3. BALANCED FEED
   * Finds articles that challenge the user's dominant political exposure.
   */
  async getBalancedFeed(userProfile: any, limit: number) {
    // 1. Determine User's "Bubble"
    const exposure = userProfile.leanExposure as { Left: number, Center: number, Right: number } || { Left: 0, Center: 0, Right: 0 };
    
    let targetLean = "Center";
    if (exposure.Left > exposure.Right + 20) targetLean = "Right"; // User is heavy Left -> Show Right
    else if (exposure.Right > exposure.Left + 20) targetLean = "Left"; // User is heavy Right -> Show Left

    // 2. Fetch High Trust articles from the opposite side
    return await prisma.article.findMany({
      where: {
        politicalLean: targetLean,
        trustScore: { gt: 75 }, // Quality filter
        isLatest: true
      },
      take: limit,
      orderBy: { publishedAt: "desc" }
    });
  },

  /**
   * 4. SMART SEARCH (Atlas + Prisma Fallback)
   * Replicates the static `smartSearch` method from Mongoose.
   */
  async smartSearch(term: string) {
    try {
      // Try MongoDB Atlas Search (Requires 'default' index on Atlas)
      // We use aggregateRaw because Prisma doesn't natively support $search
      const results = await prisma.article.aggregateRaw({
        pipeline: [
          {
            $search: {
              index: "default",
              text: {
                query: term,
                path: { wildcard: "*" },
                fuzzy: {}
              }
            }
          },
          { $limit: 20 },
          {
            $project: {
              headline: 1, summary: 1, url: 1, imageUrl: 1,
              source: 1, category: 1, publishedAt: 1,
              id: { $toString: "$_id" } // Convert ObjectId to string for frontend
            }
          }
        ]
      });
      
      return results as unknown as any[];
      
    } catch (e) {
      // Fallback: Standard Prisma Contains Search
      console.warn("Atlas Search failed, using fallback regex.");
      return await prisma.article.findMany({
        where: {
          OR: [
            { headline: { contains: term, mode: "insensitive" } },
            { summary: { contains: term, mode: "insensitive" } },
            { clusterTopic: { contains: term, mode: "insensitive" } }
          ]
        },
        take: 20,
        orderBy: { publishedAt: "desc" }
      });
    }
  },

  /**
   * 5. TOGGLE SAVE
   * Handles adding/removing articles from profile.
   */
  async toggleSaveArticle(userId: string, articleId: string) {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { id: true, savedArticleIds: true }
    });

    if (!profile) throw new Error("Profile not found");

    const isSaved = profile.savedArticleIds.includes(articleId);

    if (isSaved) {
      // Disconnect
      await prisma.profile.update({
        where: { userId },
        data: {
          savedArticles: {
            disconnect: { id: articleId }
          }
        }
      });
      return { message: "Article removed from saved" };
    } else {
      // Connect
      await prisma.profile.update({
        where: { userId },
        data: {
          savedArticles: {
            connect: { id: articleId }
          }
        }
      });
      return { message: "Article saved" };
    }
  }
};
