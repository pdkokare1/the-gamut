import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const articleRouter = router({
  // 1. Get the Main News Feed (Infinite Scroll)
  getFeed: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(), // For pagination
        category: z.string().optional(),
        sentiment: z.enum(['Positive', 'Negative', 'Neutral']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, category, sentiment } = input;

      const items = await ctx.prisma.article.findMany({
        take: limit + 1, // Fetch one extra to check if there is a next page
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { publishedAt: 'desc' },
        where: {
          ...(category && { category }),
          ...(sentiment && { sentiment }),
        },
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop(); // Remove the extra item
        nextCursor = nextItem!.id;
      }

      return {
        items,
        nextCursor,
      };
    }),

  // 2. Get Single Article by ID
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const article = await ctx.prisma.article.findUnique({
        where: { id: input.id },
      });

      if (!article) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Article not found',
        });
      }

      return article;
    }),

  // 3. Search Articles
  search: publicProcedure
    .input(z.object({ term: z.string() }))
    .query(async ({ ctx, input }) => {
      // Prisma Mongo Text Search is basic, using 'contains' for safety now
      return ctx.prisma.article.findMany({
        where: {
          OR: [
            { headline: { contains: input.term, mode: 'insensitive' } },
            { summary: { contains: input.term, mode: 'insensitive' } },
          ],
        },
        take: 10,
        orderBy: { publishedAt: 'desc' },
      });
    }),
});
