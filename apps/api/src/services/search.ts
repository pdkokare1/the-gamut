// apps/api/src/services/search.ts
import { prisma } from '@gamut/db';
import { Article } from '@gamut/db/types'; // Assuming types are generated or accessible
import logger from '../utils/logger';

class SearchService {
  
  /**
   * SMART SEARCH
   * Attempts to use MongoDB Atlas Search (Fuzzy, Ranked).
   * Falls back to Basic Search (Regex) if Atlas fails.
   */
  async search(term: string, limit: number = 20) {
    if (!term || term.length < 2) return [];

    try {
      // 1. Try Atlas Search (Raw Aggregation)
      // This requires a Search Index named "default" on your MongoDB Atlas collection
      const rawResults = await prisma.article.aggregateRaw({
        pipeline: [
          {
            $search: {
              index: 'default', // Must match your Atlas Search Index name
              text: {
                query: term,
                path: { wildcard: '*' }, // Search all fields
                fuzzy: { maxEdits: 1 }   // Allow 1 typo
              }
            }
          },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              id: { $toString: "$_id" }, // Remap _id to string id
              headline: 1,
              summary: 1,
              url: 1,
              imageUrl: 1,
              source: 1,
              category: 1,
              publishedAt: { $dateToString: { date: "$publishedAt" } }, // Normalize date
              score: { $meta: "searchScore" } // Include relevance score
            }
          }
        ]
      });

      // 2. Parse Raw Results
      // Prisma returns generic JSON, so we cast it safely
      const results = rawResults as unknown as any[];
      
      if (Array.isArray(results) && results.length > 0) {
        return results.map(r => ({
            ...r,
            publishedAt: new Date(r.publishedAt) // Ensure Date object
        }));
      }

      // If Atlas returns empty (but didn't crash), user might be searching for something rare.
      // We can try the basic search just in case, or just return empty.
      // Let's return empty to respect the search engine's decision.
      return [];

    } catch (error) {
      // 3. FALLBACK: Basic Search
      // If Atlas fails (e.g., Index doesn't exist yet), use standard Prisma regex
      // console.warn("Atlas Search failed, falling back to basic search:", error);
      
      return await this.basicFallback(term, limit);
    }
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
          id: true,
          headline: true,
          summary: true,
          url: true,
          imageUrl: true,
          source: true,
          category: true,
          publishedAt: true,
          // Note: No 'score' available in fallback
      }
    });
  }
}

export const searchService = new SearchService();
