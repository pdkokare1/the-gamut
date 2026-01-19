// apps/api/src/routers/narrative.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { prisma } from '@gamut/db';
import { TRPCError } from '@trpc/server';

export const narrativeRouter = router({
  
  // 1. IN FOCUS (Top Narratives)
  // UPDATED: Added filters for Category and Country to match old backend capabilities
  getTopNarratives: publicProcedure
    .input(z.object({ 
      limit: z.number().default(5),
      category: z.string().optional(),
      country: z.string().optional()
    }))
    .query(async ({ input }) => {
      
      const where: any = {};
      
      // Apply Filters if provided
      if (input.category) where.category = input.category;
      if (input.country) where.country = input.country;

      // Only fetch narratives updated in the last 72 hours to ensure freshness
      where.lastUpdated = { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) };

      return await prisma.narrative.findMany({
          where,
          orderBy: { lastUpdated: 'desc' },
          take: input.limit,
          select: {
              id: true,
              masterHeadline: true,
              executiveSummary: true, 
              clusterId: true,
              lastUpdated: true,
              sourceCount: true,
              category: true,
              country: true,
              // We omit deep analysis fields here for bandwidth efficiency
          }
      });
    }),

  // 2. GET FULL NARRATIVE DEEP DIVE
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const narrative = await prisma.narrative.findUnique({
        where: { id: input.id }
      });

      if (!narrative) {
        throw new TRPCError({ code: 'NOT_FOUND', message: "Narrative not found" });
      }

      // Fetch related articles to show the "Sources" behind the narrative
      const sources = await prisma.article.findMany({
        where: { clusterId: narrative.clusterId },
        take: 10, // Increased from 5 to 10 for better coverage context
        orderBy: { trustScore: 'desc' },
        select: {
            id: true,
            headline: true,
            source: true,
            url: true,
            politicalLean: true,
            publishedAt: true,
            trustScore: true,
            favicon: true // Assuming you might have this, or fallback in UI
        }
      });

      return {
        ...narrative,
        relatedArticles: sources
      };
    })
});
