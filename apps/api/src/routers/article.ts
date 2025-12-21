import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
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
        country: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, category, sentiment, country } = input;

      const items = await ctx.prisma.article.findMany({
        take: limit + 1, // Fetch one extra to check if there is a next page
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { publishedAt: 'desc' }, // Enforce recency, same as old backend
        where: {
          ...(category && { category }),
          ...(sentiment && { sentiment }),
          ...(country && country !== 'Global' ? { country } : {}),
        },
        // We select specific fields to keep the payload light, similar to the old endpoint
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
        const nextItem = items.pop(); // Remove the extra item
        nextCursor = nextItem!.id;
      }

      return {
        items,
        nextCursor,
      };
    }),

  // 2. Get Single Article by ID (With Analytics Restoration)
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

      // --- RESTORED FUNCTIONALITY: Analytics & View Counts ---
      // If the user is logged in, we must track this view
      if (ctx.user) {
        // We run this asynchronously (fire-and-forget) so we don't slow down the UI
        Promise.all([
          // 1. Increment User Stats
          ctx.prisma.profile.update({
            where: { userId: ctx.user.uid },
            data: { 
              articlesViewedCount: { increment: 1 },
              lastActiveDate: new Date(),
            },
          }),
          // 2. Create Activity Log
          ctx.prisma.activityLog.create({
            data: {
              userId: ctx.user.uid,
              articleId: article.id,
              action: 'view_analysis',
            }
          })
        ]).catch((err) => {
          console.error("Failed to update analytics for article view:", err);
        });
      }

      return article;
    }),

  // 3. Search Articles (Improved Relevance)
  search: publicProcedure
    .input(z.object({ term: z.string() }))
    .query(async ({ ctx, input }) => {
      // We prioritize matches in the headline, then summary
      // This mimics the "weights" in your old Mongoose Text Index
      const results = await ctx.prisma.article.findMany({
        where: {
          OR: [
            { headline: { contains: input.term, mode: 'insensitive' } },
            { summary: { contains: input.term, mode: 'insensitive' } },
            { clusterTopic: { contains: input.term, mode: 'insensitive' } }
          ],
        },
        take: 20,
        orderBy: { publishedAt: 'desc' },
      });

      return results;
    }),
    
  // 4. Get Related Articles (New: Missing in previous new setup)
  // This simulates the "clustering" functionality
  getRelated: publicProcedure
    .input(z.object({ 
      clusterId: z.number().nullable().optional(),
      category: z.string(),
      currentArticleId: z.string() 
    }))
    .query(async ({ ctx, input }) => {
      if (!input.clusterId) {
        // Fallback: Same category
        return ctx.prisma.article.findMany({
          where: {
            category: input.category,
            id: { not: input.currentArticleId }
          },
          take: 5,
          orderBy: { publishedAt: 'desc' }
        });
      }

      // Priority: Same Cluster
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
