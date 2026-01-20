// apps/api/src/services/search.ts
import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis'; 
import aiService from './ai'; 

// Configuration
const CACHE_TTL_SEARCH = 60 * 60; // 1 hour

class SearchService {
  
  /**
   * Helper: Optimize Image URLs (Restored from old backend)
   */
  private optimizeImageUrl(url?: string): string | undefined {
      if (!url) return undefined;
      // Example: Cloudinary optimization
      if (url.includes('cloudinary.com') && !url.includes('f_auto')) {
          return url.replace('/upload/', '/upload/f_auto,q_auto,w_800/');
      }
      return url;
  }

  /**
   * HYBRID SMART SEARCH
   * 1. Redis Cache
   * 2. Semantic Vector Search (AI)
   * 3. Atlas Text Search (Fuzzy)
   * 4. Basic Fallback (Regex)
   */
  async search(term: string, limit: number = 20, filters: any = {}) {
    if (!term || term.length < 2) return [];

    // 1. Cache Check
    const cacheKey = `search:v4:${term.toLowerCase().trim()}:${limit}:${JSON.stringify(filters)}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }

    let results: any[] = [];
    let searchMethod = 'Text';

    try {
      // 2. Try Semantic Vector Search (Preferred for conceptual matches)
      const queryEmbedding = await aiService.createEmbedding(term);
      
      if (queryEmbedding && queryEmbedding.length > 0) {
          // Note: This requires an Atlas Vector Search Index named "vector_index"
          const rawVectorResults = await prisma.article.aggregateRaw({
            pipeline: [
                {
                    $vectorSearch: {
                        index: "vector_index",
                        path: "embedding",
                        queryVector: queryEmbedding,
                        numCandidates: 100,
                        limit: limit * 2
                    }
                },
                { 
                   $project: { 
                      _id: 1, 
                      id: { $toString: "$_id" },
                      headline: 1, summary: 1, source: 1, category: 1,
                      politicalLean: 1, url: 1, imageUrl: 1, publishedAt: { $dateToString: { date: "$publishedAt" } },
                      score: { $meta: "vectorSearchScore" } 
                   } 
                }
            ]
          });

          const vectorResults = rawVectorResults as unknown as any[];
          if (vectorResults.length > 0) {
              results = vectorResults;
              searchMethod = 'Vector';
          }
      }
    } catch (err) {
      logger.warn(`⚠️ [Search] Vector search failed (falling back to text): ${err}`);
    }

    // 3. Fallback to Atlas Text Search (If Vector failed or returned nothing)
    if (results.length === 0) {
        try {
            const rawTextResults = await prisma.article.aggregateRaw({
                pipeline: [
                  {
                    $search: {
                      index: 'default', 
                      text: {
                        query: term,
                        path: { wildcard: '*' }, 
                        fuzzy: { maxEdits: 1 }   
                      }
                    }
                  },
                  { $limit: limit },
                  {
                    $project: {
                      _id: 1,
                      id: { $toString: "$_id" },
                      headline: 1, summary: 1, url: 1, imageUrl: 1, source: 1, category: 1,
                      publishedAt: { $dateToString: { date: "$publishedAt" } },
                      score: { $meta: "searchScore" }
                    }
                  }
                ]
            });
            results = rawTextResults as unknown as any[];
            searchMethod = 'Atlas Text';
        } catch (err) {
            logger.warn(`⚠️ [Search] Atlas Text search failed: ${err}`);
        }
    }

    // 4. Ultimate Fallback: Basic Prisma Regex
    if (results.length === 0) {
        results = await this.basicFallback(term, limit);
        searchMethod = 'Basic Regex';
    }

    // 5. Post-Processing (Optimization & Formatting)
    const finalResults = results
        .slice(0, limit)
        .map(r => ({
            ...r,
            publishedAt: new Date(r.publishedAt),
            imageUrl: this.optimizeImageUrl(r.imageUrl)
        }));

    // Cache the result
    if (finalResults.length > 0) {
        await redis.set(cacheKey, JSON.stringify(finalResults), 'EX', CACHE_TTL_SEARCH);
    }

    logger.info(`🔍 [Search] "${term}" | Method: ${searchMethod} | Results: ${finalResults.length}`);
    return finalResults;
  }

  private async basicFallback(term: string, limit: number) {
    return await prisma.article.findMany({
      where: {
        OR: [
          { headline: { contains: term, mode: 'insensitive' } },
          { summary: { contains: term, mode: 'insensitive' } },
          { clusterTopic: { contains: term, mode: 'insensitive' } }
        ],
      },
      take: limit,
      orderBy: { publishedAt: 'desc' },
      select: {
          id: true, headline: true, summary: true, url: true,
          imageUrl: true, source: true, category: true, publishedAt: true
      }
    });
  }
}

export const searchService = new SearchService();
