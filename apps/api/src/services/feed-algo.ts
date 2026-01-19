// apps/api/src/services/feed-algo.ts
import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { prisma } from '@gamut/db'; // Use shared client

// ==========================================
// 1. HELPERS (Deduplication & Math)
// ==========================================

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

// Helper: Text Normalizer for Deduplication
const getTokens = (str: string) => {
  return str.toLowerCase()
    .replace(/\./g, '') 
    .replace(/[^\w\s]/g, ' ') 
    .split(/\s+/)
    .filter(t => t.length > 2)
    .sort();
};

// Helper: Smart Topic Matcher
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

// ==========================================
// 2. CORE LOGIC (Feed & Search)
// ==========================================

export const feedService = {

  // --- A. HYBRID DEDUPLICATION (Trending) ---
  async getTrendingTopics() {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
    
    // Using simple findMany to get candidates
    const rawArticles = await prisma.article.findMany({
      where: {
        publishedAt: { gte: threeDaysAgo },
        clusterTopic: { not: null }
      },
      select: {
        clusterTopic: true,
        trustScore: true,
        publishedAt: true,
        embedding: true
      },
      take: 200
    });

    const topicMap = new Map();
    
    for (const art of rawArticles) {
      if (!art.clusterTopic || art.clusterTopic === "General") continue;
      
      if (!topicMap.has(art.clusterTopic)) {
        topicMap.set(art.clusterTopic, {
          topic: art.clusterTopic,
          count: 0,
          score: 0,
          vector: art.embedding,
          latestDate: art.publishedAt
        });
      }
      const entry = topicMap.get(art.clusterTopic);
      entry.count++;
      if (art.trustScore > entry.score) entry.score = art.trustScore;
    }

    const candidateList = Array.from(topicMap.values());
    const uniqueTopics: any[] = [];
    const sorted = candidateList.sort((a, b) => b.count - a.count);

    for (const item of sorted) {
      const existingIndex = uniqueTopics.findIndex(u => {
        if (areTopicsLinguisticallySimilar(u.topic, item.topic)) return true;
        const sim = calculateSimilarity(u.vector, item.vector);
        return sim > 0.92;
      });

      if (existingIndex !== -1) {
        uniqueTopics[existingIndex].count += item.count;
        if (item.topic.length > uniqueTopics[existingIndex].topic.length) {
          uniqueTopics[existingIndex].topic = item.topic;
        }
      } else {
        uniqueTopics.push(item);
      }
    }

    return uniqueTopics.sort((a, b) => b.count - a.count).slice(0, 12);
  },

  // --- B. VECTOR SEARCH (Intelligent Search) ---
  async searchArticles(query: string, embeddingVector: number[] | null, limit: number = 12) {
    if (!embeddingVector || embeddingVector.length === 0) {
      return prisma.article.findMany({
        where: {
          OR: [
            { headline: { contains: query, mode: "insensitive" } },
            { summary: { contains: query, mode: "insensitive" } }
          ]
        },
        take: limit
      });
    }

    try {
      const results = await prisma.article.aggregateRaw({
        pipeline: [
          {
            "$vectorSearch": {
              "index": "vector_index",
              "path": "embedding",
              "queryVector": embeddingVector,
              "numCandidates": 100,
              "limit": limit
            }
          },
          {
            "$project": {
              "_id": 1,
              "headline": 1, "summary": 1, "source": 1, "imageUrl": 1,
              "category": 1, "publishedAt": 1, "trustScore": 1,
              "biasScore": 1, "politicalLean": 1, "clusterId": 1
            }
          }
        ]
      });
      
      return (results as any[]).map((r: any) => ({
        ...r,
        id: r._id.$oid, 
        publishedAt: new Date(r.publishedAt.$date || r.publishedAt)
      }));
    } catch (e) {
      console.warn("Vector search failed, falling back to text", e);
      return prisma.article.findMany({
        where: { headline: { contains: query, mode: "insensitive" } },
        take: limit
      });
    }
  },

  // --- C. WEIGHTED FEED CONSTRUCTION (The "Zone" Logic) ---
  async getWeightedFeed(filters: any, userProfile: any | null) {
    const { offset = 0, limit = 20 } = filters;
    
    // Zone 3: Deep Scroll (Standard efficient paging)
    if (offset >= 20) {
      return prisma.article.findMany({
        where: { isLatest: true, ...filters.where },
        orderBy: { publishedAt: 'desc' },
        skip: offset,
        take: limit
      });
    }

    // Zone 1 & 2: Weighted Construction (First Load)
    // 1. Fetch Candidates (Last 48h)
    const candidates = await prisma.article.findMany({
      where: {
        publishedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        isLatest: true,
        ...filters.where
      },
      take: 80
    });

    // 2. Score Candidates
    const scored = candidates.map((article) => {
      let score = 0;
      
      // Time Decay Formula (Original)
      const hoursOld = (Date.now() - article.publishedAt.getTime()) / (1000 * 60 * 60);
      score += Math.max(0, 40 - (hoursOld * 1.5));

      // Quality Bonus
      if (article.trustScore > 85) score += 10;
      if (article.biasScore < 15) score += 5;

      // Personalization (Vector Similarity)
      if (userProfile?.userEmbedding && article.embedding.length > 0) {
        const sim = calculateSimilarity(userProfile.userEmbedding, article.embedding);
        score += Math.max(0, (sim - 0.5) * 100);
      }

      return { article, score };
    });

    // 3. Sort & Zone
    const sorted = scored.sort((a, b) => b.score - a.score);
    
    const zone1 = sorted.slice(0, 10).map(i => i.article); // Top Quality
    const zone2 = sorted.slice(10, 30)
      .map(i => i.article)
      .sort(() => Math.random() - 0.5); // Shuffle for discovery (Restored)

    const mixed = [...zone1, ...zone2].slice(0, limit);
    return mixed;
  }
};
