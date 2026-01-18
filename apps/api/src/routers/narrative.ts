// apps/api/src/routers/narrative.ts
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { feedService } from '../services/feed-service';
import { prisma } from '@gamut/db';
import { TRPCError } from '@trpc/server';

export const narrativeRouter = router({
  
  // 1. IN FOCUS (Top Narratives)
  getTopNarratives: publicProcedure
    .input(z.object({ 
      limit: z.number().default(5) 
    }))
    .query(async ({ input }) => {
      return await feedService.getInFocusNarratives(input.limit);
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

      // Fetch related articles for this cluster to show sources
      const sources = await prisma.article.findMany({
        where: { clusterId: narrative.clusterId },
        take: 5,
        orderBy: { trustScore: 'desc' },
        select: {
            id: true,
            headline: true,
            source: true,
            url: true,
            politicalLean: true
        }
      });

      return {
        ...narrative,
        relatedArticles: sources
      };
    })
});
