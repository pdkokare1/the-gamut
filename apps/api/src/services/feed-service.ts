// apps/api/src/services/feed-service.ts
import { prisma } from '@gamut/db';
import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { redis } from '../utils/redis'; 
import { aiService } from './ai'; 
import { CONSTANTS } from '../utils/constants';

// --- Types ---
interface FeedFilters {
  limit: number;
  cursor?: string | null;
  offset?: number; // Added to support old pagination style
  category?: string;
  politicalLean?: string;
  country?: string;
  topic?: string;
}

// --- Helpers from Old ArticleService ---

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

// Helper: Safely map raw political lean strings to keys
const mapLeanToKey = (lean: string): 'Left' | 'Right' | 'Center' => {
    if (!lean) return 'Center';
    if (lean.includes('Left') || lean.includes('Liberal')) return 'Left';
    if (lean.includes('Right') || lean.includes('Conservative')) return 'Right';
    return 'Center';
};

// --- Advanced Hybrid Deduplication Helpers ---

// 1. Text Normalizer
const getTokens = (str: string) => {
    return str.toLowerCase()
        .replace(/\./g, '') 
        .replace(/[^\w\s]/g, ' ') 
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

const deduplicateTopics = (rawTopics: any[]) => {
    const uniqueTopics: any[] = [];
    const sorted = rawTopics.sort((a, b) => b.count - a.count);

    for (const item of sorted) {
        const existingIndex = uniqueTopics.findIndex(u => {
            if (areTopicsLinguisticallySimilar(u.topic, item.topic)) return true;

            const sim = calculateSimilarity(u.vector, item.vector);
            const timeDiff = Math.abs(new Date(u.latestDate).getTime() - new Date(item.latestDate).getTime());
            const hoursDiff = timeDiff / (1000 * 60 * 60);

            return sim > 0.92 && hoursDiff < 24;
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

// --- Service Implementation ---

export const feedService = {
  
  // =================================================================
  // 1. MAIN FEED (Triple Zone Logic: Scored -> Discovery -> Deep)
  // =================================================================
  async getWeightedFeed(filters: FeedFilters, userProfile?: any) {
    const { limit, cursor, offset = 0, category, politicalLean, topic } = filters;
    const page = Number(offset) / Number(limit);

    // --- ZONE 0: TOPIC FILTER (Priority) ---
    if (topic) {
         const cleanTopic = topic.replace(/[^\w\s]/g, '').replace(/\s+/g, '.*');
         const where: Prisma.ArticleWhereInput = {
             OR: [
                 { clusterTopic: { equals: topic, mode: 'insensitive' } },
                 { clusterTopic: { contains: cleanTopic, mode: 'insensitive' } }
             ]
         };
         
         if (category && category !== 'All') where.category = category;
         if (politicalLean) where.politicalLean = politicalLean;

         const articles = await prisma.article.findMany({
             where,
             orderBy: { publishedAt: 'desc' },
             skip: Number(offset),
             take: Number(limit),
             include: { savedByProfiles: userProfile ? { where: { id: userProfile.id } } : false }
         });

         return articles.map(a => ({
             ...a,
             imageUrl: optimizeImageUrl(a.imageUrl),
             isSaved: userProfile ? a.savedByProfiles.length > 0 : false
         }));
    }

    // --- ZONE 3: DEEP SCROLLING (Simple Pagination) ---
    // If user is deep in the feed, avoid expensive weighting logic
    if (page >= 5 || cursor) {
         const where: Prisma.ArticleWhereInput = {};
         if (category && category !== 'All') where.category = category;
         if (politicalLean) where.politicalLean = politicalLean;
         if (cursor) where.id = { lt: cursor };

         const articles = await prisma.article.findMany({
             where,
             orderBy: { publishedAt: 'desc' },
             skip: cursor ? 0 : Number(offset),
             take: Number(limit),
             include: { savedByProfiles: userProfile ? { where: { id: userProfile.id } } : false }
         });

         return articles.map(a => ({
             ...a,
             imageUrl: optimizeImageUrl(a.imageUrl),
             isSaved: userProfile ? a.savedByProfiles.length > 0 : false
         }));
    }

    // --- ZONE 1 & 2: WEIGHTED CONSTRUCTION (First Load) ---
    const where: Prisma.ArticleWhereInput = {
        publishedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } // Last 48h
    };
    if (category && category !== 'All') where.category = category;
    if (politicalLean) where.politicalLean = politicalLean;

    // Fetch Candidates (Take 80 to have a pool to score)
    const candidates = await prisma.article.findMany({
        where,
        take: 80,
        orderBy: { publishedAt: 'desc' },
        include: {
            savedByProfiles: userProfile ? { where: { id: userProfile.id } } : false
        }
    });

    // Score Candidates
    const scoredCandidates = candidates.map((article) => {
        let score = 0;
        
        // A. Recency Score
        const hoursOld = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60);
        score += Math.max(0, 40 - (hoursOld * 1.5));

        // B. Quality Modifiers
        if (article.trustScore > 85) score += 10;
        if (article.biasScore < 15) score += 5; 
        if (article.isLatest) score += 10; 

        // C. Personalization (Vector Similarity)
        if (userProfile?.userEmbedding && article.embedding.length > 0) {
            const sim = calculateSimilarity(userProfile.userEmbedding, article.embedding);
            score += Math.max(0, (sim - 0.5) * 100); 
        }

        return { article, score };
    });

    const sorted = scoredCandidates.sort((a, b) => b.score - a.score);

    // Zone 1: Top 10 High Score
    const zone1 = sorted.slice(0, 10).map(i => i.article);
    const zone1Ids = new Set(zone1.map(a => a.id));

    // Zone 2: Discovery (Randomized from next 20)
    const zone2Candidates = sorted.slice(10, 30).filter(i => !zone1Ids.has(i.article.id));
    const zone2 = zone2Candidates
        .map(i => i.article)
        .sort(() => Math.random() - 0.5);

    const merged = [...zone1, ...zone2].slice(0, Number(limit));

    return merged.map(article => ({
        ...article,
        imageUrl: optimizeImageUrl(article.imageUrl),
        isSaved: userProfile ? article.savedByProfiles.length > 0 : false
    }));
  },

  // =================================================================
  // 2. TRENDING TOPICS (Hybrid Deduplication: Text + Vector)
  // =================================================================
  async getTrendingTopics(limit: number = 12) {
      // CACHE BUST: 'v13'
      return redis.getOrFetch('trending_topics_v13', async () => {
          const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

          // 1. Fetch Candidates (Raw fetch because we need vectors for dedupe)
          const candidates = await prisma.article.findMany({
              where: {
                  publishedAt: { gte: threeDaysAgo },
                  clusterTopic: { not: null }
              },
              select: {
                  clusterTopic: true,
                  trustScore: true,
                  embedding: true,
                  publishedAt: true
              },
              orderBy: { publishedAt: 'desc' },
              take: 200 // Fetch larger pool for analysis
          });

          // 2. In-Memory Aggregation (Since Prisma doesn't support complex group + first vector)
          const topicMap = new Map();

          for (const c of candidates) {
              if (!c.clusterTopic) continue;
              if (c.clusterTopic === 'General') continue;

              if (!topicMap.has(c.clusterTopic)) {
                  topicMap.set(c.clusterTopic, {
                      topic: c.clusterTopic,
                      count: 0,
                      vector: c.embedding,
                      latestDate: c.publishedAt
                  });
              }
              const entry = topicMap.get(c.clusterTopic);
              entry.count += 1;
          }

          const rawList = Array.from(topicMap.values()).filter(x => x.count >= 2);

          // 3. Hybrid Deduplication
          const cleanList = deduplicateTopics(rawList);

          // 4. Return Top N
          return cleanList
              .sort((a, b) => b.count - a.count)
              .slice(0, limit)
              .map(({ vector, latestDate, ...rest }) => rest);

      }, CONSTANTS.CACHE.TTL_TRENDING || 300); // Default 5 mins if constant missing
  },

  // =================================================================
  // 3. INTELLIGENT SEARCH (Vector -> Atlas -> Text Chain)
  // =================================================================
  async searchArticles(query: string, limit: number = 20) {
    if (!query) return { articles: [], total: 0 };
    
    const safeQuery = query.replace(/[^\w\s\-\.\?]/gi, '');
    
    // 1. Attempt Vector Search
    try {
        const queryEmbedding = await aiService.createEmbedding(safeQuery);
        
        if (queryEmbedding && queryEmbedding.length > 0) {
             const rawResult = await prisma.$runCommandRaw({
                aggregate: "articles",
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
                            "_id": 1, "headline": 1, "summary": 1, "source": 1, "category": 1,
                            "politicalLean": 1, "url": 1, "imageUrl": 1, "publishedAt": 1,
                            "trustScore": 1, "clusterTopic": 1,
                            "score": { "$meta": "vectorSearchScore" }
                        }
                    }
                ],
                cursor: {}
             });

             const hits = (rawResult as any).cursor?.firstBatch || [];
             if (hits.length > 0) {
                 // Remap _id to id for consistency
                 return { 
                     articles: hits.map((h: any) => ({ ...h, id: h._id, imageUrl: optimizeImageUrl(h.imageUrl) })), 
                     total: hits.length 
                 };
             }
        }
    } catch (err) {
        console.warn(`[Search] Vector search failed: ${err}`);
    }

    // 2. Fallback: Atlas Text Search
    try {
         const rawResult = await prisma.$runCommandRaw({
            aggregate: "articles",
            pipeline: [
              {
                "$search": {
                  "index": "default", 
                  "text": {
                    "query": safeQuery,
                    "path": { "wildcard": "*" },
                    "fuzzy": {}
                  }
                }
              },
              { "$limit": limit },
              {
                "$project": {
                   "_id": 1, "headline": 1, "summary": 1, "imageUrl": 1, "publishedAt": 1,
                   "score": { "$meta": "searchScore" }
                }
              }
            ],
            cursor: {}
         });
         
         const hits = (rawResult as any).cursor?.firstBatch || [];
         if (hits.length > 0) {
             return { 
                 articles: hits.map((h: any) => ({ ...h, id: h._id, imageUrl: optimizeImageUrl(h.imageUrl) })), 
                 total: hits.length 
             };
         }
    } catch (err) {
        console.warn(`[Search] Atlas text search failed: ${err}`);
    }

    // 3. Final Fallback: Standard Regex
    const articles = await prisma.article.findMany({
         where: {
             OR: [
                 { headline: { contains: safeQuery, mode: 'insensitive' } },
                 { summary: { contains: safeQuery, mode: 'insensitive' } },
                 { clusterTopic: { contains: safeQuery, mode: 'insensitive' } }
             ]
         },
         take: limit,
         orderBy: { publishedAt: 'desc' }
    });

    return { 
        articles: articles.map(a => ({...a, imageUrl: optimizeImageUrl(a.imageUrl)})), 
        total: articles.length 
    };
  },

  // =================================================================
  // 4. BALANCED FEED (Anti-Echo Chamber)
  // =================================================================
  async getBalancedFeed(userProfile: any, limit: number = 20) {
      if (!userProfile) {
          // If no user, just return high trust news
          const articles = await prisma.article.findMany({
              where: { trustScore: { gte: 80 } },
              take: limit,
              orderBy: { publishedAt: 'desc' }
          });
          return { articles, meta: { reason: "Trusted Headlines" } };
      }

      // Fetch User Stats
      const stats = await prisma.userStats.findUnique({
          where: { userId: userProfile.userId }
      });

      let targetLean: string[] = [];
      let reason = "Global Perspectives";

      if (stats?.leanExposure) {
          const { Left, Right, Center } = stats.leanExposure;
          const total = Left + Right + Center;

          if (total > 50) { 
               if (Left > Right * 1.5) {
                   targetLean = ['Right', 'Right-Leaning', 'Center'];
                   reason = "Perspectives from Center & Right";
               } else if (Right > Left * 1.5) {
                   targetLean = ['Left', 'Left-Leaning', 'Center'];
                   reason = "Perspectives from Center & Left";
               } else {
                   reason = "Deep Dive & Neutral Analysis";
               }
          }
      }

      const where: Prisma.ArticleWhereInput = {
          publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          trustScore: { gte: 70 }
      };

      if (targetLean.length > 0) {
          where.politicalLean = { in: targetLean };
      }

      const articles = await prisma.article.findMany({
          where,
          orderBy: { trustScore: 'desc' },
          take: limit
      });

      return {
          articles: articles.map(a => ({ 
              ...a, 
              imageUrl: optimizeImageUrl(a.imageUrl), 
              suggestionType: 'Challenge' 
          })),
          meta: { reason }
      };
  },

  // =================================================================
  // 5. IN FOCUS (Narratives or Top Stories)
  // =================================================================
  async getInFocusFeed(filters: FeedFilters) {
     const { offset = 0, limit = 20, category } = filters;
     
     const where: Prisma.NarrativeWhereInput = {};
     if (category && category !== 'All') {
         where.category = category;
     }

     try {
         const narratives = await prisma.narrative.findMany({
             where,
             orderBy: { lastUpdated: 'desc' },
             skip: Number(offset),
             take: Number(limit)
         });

         if (narratives.length > 0) {
             return {
                 articles: narratives.map(n => ({
                     ...n,
                     type: 'Narrative', 
                     publishedAt: n.lastUpdated 
                 })),
                 meta: { description: "Top Developing Stories" }
             };
         }
     } catch (err) {
         console.error("[InFocus] Error fetching narratives:", err);
     }

     // Fallback to Articles if no narratives
     return this.getWeightedFeed(filters);
  },

  // =================================================================
  // 6. TOGGLE SAVE
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
              data: { savedArticles: { disconnect: { id: articleId } } }
          });
          return { saved: false };
      } else {
          await prisma.profile.update({
              where: { userId },
              data: { savedArticles: { connect: { id: articleId } } }
          });
          return { saved: true };
      }
  },
  
  // =================================================================
  // 7. GET SAVED
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

      if (!profile) return [];
      
      return profile.savedArticles.map(article => ({
          ...article,
          imageUrl: optimizeImageUrl(article.imageUrl),
          isSaved: true
      }));
  },

  // =================================================================
  // 8. ADMIN / MIGRATION HELPERS
  // =================================================================
  async createArticle(data: any) {
      return await prisma.article.create({ data });
  },

  async updateArticle(id: string, data: any) {
      return await prisma.article.update({ where: { id }, data });
  },

  async deleteArticle(id: string) {
      return await prisma.article.delete({ where: { id } });
  }
};
