// apps/api/src/services/article-service.ts

import { prisma } from '@gamut/db';
import { redis } from '../utils/redis';
import { aiService } from './ai';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../utils/constants';

// --- Types ---
export interface FeedFilters {
  offset?: number;
  limit?: number;
  category?: string;
  politicalLean?: string;
  topic?: string;
}

interface TopicResult {
  topic: string;
  count: number;
  score: number;
  vector?: number[];
  latestDate: Date;
}

// --- Helpers (Preserved from Original) ---

// Helper: Optimize Image URLs for bandwidth
const optimizeImageUrl = (url?: string | null) => {
  if (!url) return undefined;
  if (url.includes('cloudinary.com') && !url.includes('f_auto')) {
    return url.replace('/upload/', '/upload/f_auto,q_auto,w_800/');
  }
  return url;
};

// Helper: Cosine Similarity for Vector Matching
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

// Helper: Safely map raw political lean strings to UserStats keys
const mapLeanToKey = (lean: string): 'Left' | 'Right' | 'Center' => {
  if (!lean) return 'Center';
  if (lean.includes('Left') || lean.includes('Liberal')) return 'Left';
  if (lean.includes('Right') || lean.includes('Conservative')) return 'Right';
  return 'Center';
};

// --- HYBRID DEDUPLICATION LOGIC ---

// 1. Text Normalizer
const getTokens = (str: string) => {
  return str.toLowerCase()
    .replace(/\./g, '') // Remove dots
    .replace(/[^\w\s]/g, ' ') // Replace punctuation
    .split(/\s+/)
    .filter(t => t.length > 2)
    .sort();
};

// 2. Smart String Matcher
const areTopicsLinguisticallySimilar = (topicA: string, topicB: string) => {
  const tokensA = getTokens(topicA);
  const tokensB = getTokens(topicB);

  const strA = tokensA.join(' ');
  const strB = tokensB.join(' ');
  if (strA === strB) return true;

  let matches = 0;
  const total = Math.max(tokensA.length, tokensB.length);
  if (total === 0) return false;

  for (const tA of tokensA) {
    for (const tB of tokensB) {
      if (tA === tB || tA.includes(tB) || tB.includes(tA)) {
        matches++;
        break;
      }
    }
  }

  return (matches / total) >= 0.7;
};

const deduplicateTopics = (rawTopics: TopicResult[]) => {
  const uniqueTopics: TopicResult[] = [];
  const sorted = rawTopics.sort((a, b) => b.count - a.count);

  for (const item of sorted) {
    const existingIndex = uniqueTopics.findIndex(u => {
      if (areTopicsLinguisticallySimilar(u.topic, item.topic)) return true;

      // Vector Match Fallback (if vectors exist)
      if (u.vector && item.vector) {
        const sim = calculateSimilarity(u.vector, item.vector);
        const timeDiff = Math.abs(new Date(u.latestDate).getTime() - new Date(item.latestDate).getTime());
        const hoursDiff = timeDiff / (1000 * 60 * 60);
        return sim > 0.92 && hoursDiff < 24;
      }
      return false;
    });

    if (existingIndex !== -1) {
      uniqueTopics[existingIndex].count += item.count;
      if (item.topic.length > uniqueTopics[existingIndex].topic.length) {
        uniqueTopics[existingIndex].topic = item.topic;
      }
    } else {
      uniqueTopics.push({ ...item });
    }
  }

  return uniqueTopics;
};


class ArticleService {

  // --- 1. Smart Trending Topics (72h + Hybrid Dedupe) ---
  async getTrendingTopics() {
    // CACHE BUST: 'v12-prisma'
    return redis.getOrFetch(
      'trending_topics_v12_prisma',
      async () => {
        const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

        // Prisma does not support complex group/sort pipelines natively on MongoDB yet,
        // so we use aggregateRaw to keep performance high.
        const rawResults = await prisma.article.aggregateRaw({
          pipeline: [
            {
              $match: {
                publishedAt: { $gte: { $date: threeDaysAgo } }, // Prisma Raw requires explicit Date mapping
                clusterTopic: { $exists: true, $ne: "" }
              }
            },
            { $sort: { publishedAt: -1 } },
            {
              $group: {
                _id: "$clusterTopic",
                count: { $sum: 1 },
                sampleScore: { $max: "$trustScore" },
                latestVector: { $first: "$embedding" },
                latestDate: { $first: "$publishedAt" }
              }
            },
            {
              $match: {
                count: { $gte: 3 },
                _id: { $ne: "General" }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 60 }
          ]
        }) as unknown as any[];

        const candidateList: TopicResult[] = rawResults.map(r => ({
          topic: r._id,
          count: r.count,
          score: r.sampleScore,
          vector: r.latestVector || [],
          latestDate: new Date(r.latestDate)
        }));

        const cleanList = deduplicateTopics(candidateList);

        return cleanList
          .sort((a, b) => b.count - a.count)
          .slice(0, 12)
          .map(({ vector, latestDate, ...rest }) => rest);
      },
      CONSTANTS.CACHE.TTL_TRENDING
    );
  }

  // --- 2. Intelligent Search (Vector + Text Fallback) ---
  async searchArticles(query: string, limit: number = 12) {
    if (!query) return { articles: [], total: 0 };

    const safeQuery = query.replace(/[^\w\s\-\.\?]/gi, '');
    const CACHE_KEY = `search:v3:${safeQuery.toLowerCase().trim()}:${limit}`;

    return redis.getOrFetch(CACHE_KEY, async () => {
      let articles: any[] = [];
      let searchMethod = 'Text';

      try {
        const queryEmbedding = await aiService.createEmbedding(safeQuery);

        if (queryEmbedding && queryEmbedding.length > 0) {
          // Vector Search using aggregateRaw
          const rawVectorResults = await prisma.article.aggregateRaw({
            pipeline: [
              {
                "$vectorSearch": {
                  "index": "vector_index",
                  "path": "embedding",
                  "queryVector": queryEmbedding,
                  "numCandidates": 100,
                  "limit": limit * 2
                }
              },
              { "$limit": limit },
              {
                "$project": {
                  "_id": 1,
                  "id": { "$toString": "$_id" },
                  "headline": 1, "summary": 1, "source": 1, "category": 1,
                  "politicalLean": 1, "url": 1, "imageUrl": 1, "publishedAt": 1,
                  "analysisType": 1, "sentiment": 1, "biasScore": 1, "trustScore": 1,
                  "clusterTopic": 1, "audioUrl": 1,
                  "keyFindings": 1,
                  "score": { "$meta": "vectorSearchScore" }
                }
              }
            ]
          });
          
          articles = rawVectorResults as any[];
          searchMethod = 'Vector';
        }
      } catch (err) {
        logger.warn(`Semantic Search Failed (Fallback to Text): ${err}`);
      }

      if (!articles.length) {
        // Fallback to Atlas Text Search via aggregateRaw
        const rawTextResults = await prisma.article.aggregateRaw({
          pipeline: [
            {
              $search: {
                index: 'default',
                text: {
                  query: safeQuery,
                  path: { wildcard: '*' },
                  fuzzy: { maxEdits: 1 }
                }
              }
            },
            { $limit: limit },
            {
               $project: {
                  "_id": 1, "id": { "$toString": "$_id" },
                  "headline": 1, "summary": 1, "source": 1, "category": 1, 
                  "url": 1, "imageUrl": 1, "publishedAt": 1,
                  "score": { "$meta": "searchScore" }
               }
            }
          ]
        });
        articles = rawTextResults as any[];
      }

      // Final mapping to ensure Dates and Images are correct
      const processedArticles = articles.map(a => ({
        ...a,
        publishedAt: new Date(a.publishedAt), // Ensure Date object
        imageUrl: optimizeImageUrl(a.imageUrl)
      }));

      logger.info(`🔍 Search: "${safeQuery}" | Method: ${searchMethod} | Results: ${processedArticles.length}`);
      return { articles: processedArticles, total: processedArticles.length };

    }, CONSTANTS.CACHE.TTL_SEARCH);
  }

  // --- 3. Weighted Merge Main Feed (Triple Zone) ---
  async getMainFeed(filters: FeedFilters, userId?: string) {
    const { offset = 0, limit = 20, topic } = filters;
    const page = Number(offset);

    // PRIORITY TOPIC FILTER
    if (topic) {
      // Regex handling for "U.S. Immigration" vs "US Immigration"
      const cleanTopic = topic.replace(/[^\w\s]/g, '').replace(/\s+/g, '.*');
      
      const whereClause: any = {
        OR: [
          { clusterTopic: topic },
          { clusterTopic: { mode: 'insensitive', contains: cleanTopic } }
        ]
      };

      if (filters.category && filters.category !== 'All') whereClause.category = filters.category;
      if (filters.politicalLean) whereClause.politicalLean = filters.politicalLean;

      const articles = await prisma.article.findMany({
        where: whereClause,
        orderBy: { publishedAt: 'desc' },
        skip: page,
        take: Number(limit),
        select: { embedding: false, recommendations: false } // Exclude heavy fields
      });

      return {
        articles: articles.map(a => ({
          ...a,
          type: 'Article',
          imageUrl: optimizeImageUrl(a.imageUrl)
        })),
        pagination: { total: 100 }
      };
    }

    // ZONE 3: Deep Scrolling (Optimized)
    if (page >= 20) {
      // Construct Prisma Where Input
      const where: any = {};
      if (filters.category && filters.category !== 'All') where.category = filters.category;
      if (filters.politicalLean) where.politicalLean = filters.politicalLean;

      const articles = await prisma.article.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: page,
        take: Number(limit),
      });

      return {
        articles: articles.map(a => ({ ...a, type: 'Article', imageUrl: optimizeImageUrl(a.imageUrl) })),
        pagination: { total: 1000 }
      };
    }

    // ZONE 1 & 2: Weighted Construction (First Page Load)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const initialWhere: any = {
      publishedAt: { gte: twoDaysAgo }
    };

    if (filters.category && filters.category !== 'All') initialWhere.category = filters.category;
    if (filters.politicalLean) initialWhere.politicalLean = filters.politicalLean;

    // Fetch Candidates and User Data Parallelly
    const [latestCandidates, userProfile, userStats] = await Promise.all([
      prisma.article.findMany({
        where: initialWhere,
        orderBy: { publishedAt: 'desc' },
        take: 80,
      }),
      userId ? prisma.profile.findUnique({ where: { userId }, select: { userEmbedding: true } }) : null,
      userId ? prisma.userStats.findUnique({ where: { userId }, select: { leanExposure: true, topicInterest: true } }) : null
    ]);

    // Score Candidates
    const scoredCandidates = latestCandidates.map((article) => {
      let score = 0;

      const hoursOld = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60);
      score += Math.max(0, 40 - (hoursOld * 1.5));

      if (article.trustScore > 85) score += 10;
      if (article.clusterId && article.isLatest) score += 10;
      if (article.biasScore < 15) score += 5;

      const userVec = userProfile?.userEmbedding;
      if (userVec && article.embedding) {
        const sim = calculateSimilarity(userVec, article.embedding);
        score += Math.max(0, (sim - 0.5) * 100);
      } else if (userStats) {
        // Handle Json types safely
        const interests = userStats.topicInterest as Record<string, number> | null;
        if (interests && interests[article.category] > 60) score += 20;
        
        const leanKey = mapLeanToKey(article.politicalLean);
        if (userStats.leanExposure && (userStats.leanExposure as any)[leanKey] > (userStats.leanExposure as any).Center) {
            score += 10;
        }
      }

      // Return clean object without embedding
      const { embedding, ...cleanArticle } = article;
      return { article: cleanArticle, score };
    });

    const sorted = scoredCandidates.sort((a, b) => b.score - a.score);

    // Zone 1: Top 10 Scored
    const zone1 = sorted.slice(0, 10).map(i => i.article);
    const zone1Ids = new Set(zone1.map(a => a.id));

    // Zone 2: Random Mix from remaining top 20
    const zone2Candidates = sorted.slice(10, 30).filter(i => !zone1Ids.has(i.article.id));
    const zone2 = zone2Candidates
      .map(i => i.article)
      .sort(() => Math.random() - 0.5);

    const mixedFeed = [...zone1, ...zone2];
    const resultFeed = mixedFeed.slice(0, Number(limit));

    return {
      articles: resultFeed.map(a => ({
        ...a,
        type: 'Article',
        imageUrl: optimizeImageUrl(a.imageUrl)
      })),
      pagination: { total: 1000 }
    };
  }

  // --- 4. In Focus Feed (Narratives OR Top Stories) ---
  async getInFocusFeed(filters: FeedFilters) {
    const { offset = 0, limit = 20 } = filters;
    const page = Number(offset);

    const where: any = {};
    if (filters.category && filters.category !== 'All') {
        where.category = { contains: filters.category, mode: 'insensitive' };
    }

    let narratives: any[] = [];
    
    try {
        narratives = await prisma.narrative.findMany({
            where,
            orderBy: { lastUpdated: 'desc' },
            skip: page,
            take: Number(limit)
        });
        
        // Fallback if filtered list is empty but it's the first page
        if (narratives.length === 0 && page === 0) {
            narratives = await prisma.narrative.findMany({
                orderBy: { lastUpdated: 'desc' },
                take: Number(limit)
            });
        }
    } catch (err) {
        logger.error("[InFocus] Prisma Error:", err);
        narratives = [];
    }

    if (narratives.length === 0) {
        // Fallback to Articles
        const articles = await prisma.article.findMany({
            where,
            orderBy: { publishedAt: 'desc' },
            skip: page,
            take: Number(limit),
            select: { embedding: false }
        });

        return {
            articles: articles.map(a => ({
                ...a,
                type: 'Article',
                imageUrl: optimizeImageUrl(a.imageUrl)
            })),
            meta: { description: "Top Headlines" }
        };
    }

    return {
        articles: narratives.map(n => ({
            ...n,
            type: 'Narrative',
            publishedAt: n.lastUpdated
        })),
        meta: { description: "Top Developing Stories" }
    };
  }

  // --- 5. Balanced Feed (Anti-Echo Chamber) ---
  async getBalancedFeed(userId: string) {
    if (!userId) {
      const feed = await this.getMainFeed({ limit: 20 });
      return {
        articles: feed.articles,
        meta: { reason: "Trending Headlines" }
      };
    }

    const stats = await prisma.userStats.findUnique({ where: { userId } });
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let where: any = {
       publishedAt: { gte: oneWeekAgo }
    };
    let reason = "Global Perspectives";

    if (stats && stats.leanExposure) {
      const exposure = stats.leanExposure as any; // Typed as LeanExposure
      const { Left, Right, Center } = exposure;
      const total = Left + Right + Center;

      if (total > 300) {
        if (Left > Right * 1.5) {
          where.politicalLean = { in: ['Right', 'Right-Leaning', 'Center'] };
          reason = "Perspectives from Center & Right";
        } else if (Right > Left * 1.5) {
          where.politicalLean = { in: ['Left', 'Left-Leaning', 'Center'] };
          reason = "Perspectives from Center & Left";
        } else {
          reason = "Deep Dive & Neutral Analysis";
        }
      }
    }

    const articles = await prisma.article.findMany({
      where,
      orderBy: [
        { trustScore: 'desc' },
        { publishedAt: 'desc' }
      ],
      take: 20,
      select: { embedding: false }
    });

    return {
      articles: articles.map(a => ({
        ...a,
        type: 'Article',
        imageUrl: optimizeImageUrl(a.imageUrl),
        suggestionType: 'Challenge'
      })),
      meta: { reason }
    };
  }

  // --- 6. Personalized Feed ---
  async getPersonalizedFeed(userId: string) {
      const CACHE_KEY = `my_mix_v2_prisma:${userId}`;
      
      return redis.getOrFetch(CACHE_KEY, async () => {
          const profile = await prisma.profile.findUnique({ 
              where: { userId },
              select: { userEmbedding: true } 
          });

          if (!profile || !profile.userEmbedding || profile.userEmbedding.length === 0) {
              return { articles: [], meta: { reason: "No profile" } };
          }

          try {
              const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
              
              const rawResults = await prisma.article.aggregateRaw({
                  pipeline: [
                      {
                          "$vectorSearch": {
                              "index": "vector_index",
                              "path": "embedding",
                              "queryVector": profile.userEmbedding,
                              "numCandidates": 150,
                              "limit": 50
                          }
                      },
                      {
                          "$match": {
                              "publishedAt": { "$gte": { "$date": threeDaysAgo } }
                          }
                      },
                      { "$limit": 20 },
                      {
                          "$project": {
                            "_id": 1, "id": { "$toString": "$_id" },
                            "headline": 1, "summary": 1, "source": 1, "category": 1,
                            "politicalLean": 1, "url": 1, "imageUrl": 1, "publishedAt": 1,
                            "analysisType": 1, "sentiment": 1, "biasScore": 1, "trustScore": 1,
                            "clusterTopic": 1, "audioUrl": 1, "keyFindings": 1,
                            "score": { "$meta": "vectorSearchScore" }
                          }
                      }
                  ]
              }) as any[];

              return {
                  articles: rawResults.map(a => ({
                      ...a,
                      publishedAt: new Date(a.publishedAt),
                      suggestionType: 'Comfort',
                      imageUrl: optimizeImageUrl(a.imageUrl)
                  })),
                  meta: { topCategories: ["AI Curated"] }
              };

          } catch (error) {
              logger.error(`Vector Search Failed: ${error}`);
              return { articles: [], meta: { reason: "Error" } };
          }
      }, CONSTANTS.CACHE.TTL_PERSONAL);
  }

  // --- 7. Saved Articles ---
  async getSavedArticles(userId: string) {
    const profile = await prisma.profile.findUnique({
        where: { userId },
        include: { savedArticles: true } 
    });

    if (!profile || !profile.savedArticles) return [];

    // Articles are already fetched via relation, just sort them
    const articles = profile.savedArticles.sort((a, b) => 
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    return articles.map(a => ({
        ...a,
        imageUrl: optimizeImageUrl(a.imageUrl)
    }));
  }

  // --- 8. Toggle Save (Transaction) ---
  async toggleSaveArticle(userId: string, articleId: string) {
    // 1. Check if already saved
    const profile = await prisma.profile.findFirst({
        where: { 
            userId,
            savedArticleIds: { has: articleId } 
        }
    });

    let message = '';
    
    if (profile) {
        // Unsave: Disconnect
        await prisma.profile.update({
            where: { userId },
            data: {
                savedArticles: {
                    disconnect: { id: articleId }
                }
            }
        });
        message = 'Article unsaved';
    } else {
        // Save: Connect
        await prisma.profile.update({
            where: { userId },
            data: {
                savedArticles: {
                    connect: { id: articleId }
                }
            }
        });
        message = 'Article saved';
    }

    // Return updated list IDs for UI sync
    const updatedProfile = await prisma.profile.findUnique({
        where: { userId },
        select: { savedArticleIds: true }
    });

    return { message, savedArticles: updatedProfile?.savedArticleIds || [] };
  }
}

export const articleService = new ArticleService();
