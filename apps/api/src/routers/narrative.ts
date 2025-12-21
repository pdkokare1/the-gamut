import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const narrativeRouter = router({
  // 1. Get Top Narratives (The "Trending" Clusters)
  getTop: publicProcedure
    .input(z.object({ limit: z.number().default(5) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.narrative.findMany({
        take: input.limit,
        orderBy: { lastUpdated: 'desc' }, // Show most recently active stories first
        where: {
          sourceCount: { gt: 1 }, // Only show clusters with more than 1 article (real stories)
        },
      });
    }),

  // 2. Get Single Narrative by Cluster ID
  getByClusterId: publicProcedure
    .input(z.object({ clusterId: z.number() }))
    .query(async ({ ctx, input }) => {
      const narrative = await ctx.prisma.narrative.findUnique({
        where: { clusterId: input.clusterId },
      });

      if (!narrative) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Narrative not found',
        });
      }

      // Fetch the articles that belong to this cluster
      const articles = await ctx.prisma.article.findMany({
        where: { clusterId: input.clusterId },
        orderBy: { publishedAt: 'desc' },
        select: {
            id: true,
            headline: true,
            source: true,
            publishedAt: true,
            sentiment: true,
            biasScore: true
        }
      });

      return {
        ...narrative,
        articles,
      };
    }),
});
