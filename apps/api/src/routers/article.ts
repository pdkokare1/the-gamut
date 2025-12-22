import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { searchService } from '../services/search'; // Import the new service

export const articleRouter = router({
  // 1. Get the Main News Feed (Infinite Scroll)
  getFeed: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(), // For pagination
        category: z.string().optional(),
        sentiment: z.enum(['Positive', 'Negative', 'Neutral']).optional(),
        country: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, category, sentiment, country } = input;

      const items = await ctx.prisma.article.findMany({
        take: limit + 1, // Fetch one extra to check if there is a next page
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { publishedAt: 'desc' }, // Enforce recency
        where: {
          ...(category && { category }),
          ...(sentiment && { sentiment }),
          ...(country && country !== 'Global' ? { country } : {}),
        },
        select: {
          id: true,
          headline: true,
          summary: true,
          source: true,
          publishedAt: true,
          imageUrl: true,
          category: true,
          sentiment: true,
          biasScore: true,
          trustScore: true,
        }
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop(); 
        nextCursor = nextItem!.id;
      }

      return {
        items,
        nextCursor,
      };
    }),

  // 2. Get Single Article by ID (With Analytics)
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

      // Track Views (Fire-and-forget)
      if (ctx.user) {
        Promise.all([
          ctx.prisma.profile.update({
            where: { userId: ctx.user.uid },
            data: { 
              articlesViewedCount: { increment: 1 },
              lastActiveDate: new Date(),
            },
          }),
          ctx.prisma.activityLog.create({
            data: {
              userId: ctx.user.uid,
              articleId: article.id,
              action: 'view_analysis',
            }
          })
        ]).catch((err) => {
          console.error("Failed to update analytics:", err);
        });
      }

      return article;
    }),

  // 3. Search Articles (Updated: Now uses Smart Search Service)
  search: publicProcedure
    .input(z.object({ term: z.string() }))
    .query(async ({ ctx, input }) => {
      // Delegates complex logic to the service
      // Service handles Atlas Aggregation AND Fallback
      return await searchService.search(input.term);
    }),
    
  // 4. Get Related Articles
  getRelated: publicProcedure
    .input(z.object({ 
      clusterId: z.number().nullable().optional(),
      category: z.string(),
      currentArticleId: z.string() 
    }))
    .query(async ({ ctx, input }) => {
      if (!input.clusterId) {
        return ctx.prisma.article.findMany({
          where: {
            category: input.category,
            id: { not: input.currentArticleId }
          },
          take: 5,
          orderBy: { publishedAt: 'desc' }
        });
      }

      return ctx.prisma.article.findMany({
        where: {
          clusterId: input.clusterId,
          id: { not: input.currentArticleId }
        },
        take: 5,
        orderBy: { publishedAt: 'desc' }
      });
    }),
});
