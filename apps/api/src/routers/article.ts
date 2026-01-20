// apps/api/src/routers/article.ts
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { feedService } from '../services/feed-service';
import { prisma } from '@gamut/db';
import { TRPCError } from '@trpc/server';

export const articleRouter = router({
  
  // 1. MAIN FEED (Infinite Scroll + Full Filters)
  getFeed: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10),
      cursor: z.string().nullish(), // For cursor-based pagination
      offset: z.number().optional(), // For classic pagination fallback
      
      // Filters (Restored from old Controller)
      category: z.string().optional(),
      politicalLean: z.string().optional(),
      sentiment: z.string().optional(),
      source: z.string().optional(),
      country: z.string().optional(),
      topic: z.string().optional(),
      sort: z.string().optional(), // RESTORED: Needed for "Sort by Latest/Relevant"
      startDate: z.string().optional(), // ISO Date String
      endDate: z.string().optional()    // ISO Date String
    }))
    .query(async ({ input, ctx }) => {
      // Pass user profile if logged in (for personalization)
      const userProfile = ctx.user ? await prisma.profile.findUnique({
          where: { userId: ctx.user.uid }
      }) : null;

      const result = await feedService.getWeightedFeed(input, userProfile);
      
      let nextCursor: typeof input.cursor = undefined;
      
      // Handle Cursor Logic
      if (result.articles.length > input.limit) {
        const nextItem = result.articles.pop(); // Remove the extra item
        nextCursor = nextItem?.id;
      }

      return {
        items: result.articles,
        nextCursor,
        total: result.pagination.total // For UI progress bars
      };
    }),

  // 2. GET SINGLE ARTICLE (With AI Analysis)
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const article = await prisma.article.findUnique({
        where: { id: input.id },
        include: {
           // Include specific relations if needed
           savedByProfiles: false
        }
      });

      if (!article) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
      }

      return article;
    }),

  // 3. SMART SEARCH (Vector + Text)
  search: publicProcedure
    .input(z.object({ query: z.string().min(2), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return await feedService.searchArticles(input.query, input.limit);
    }),

  // 4. BALANCED FEED (Echo Chamber Breaker)
  getBalancedFeed: protectedProcedure
    .input(z.object({ limit: z.number().default(5) }))
    .query(async ({ input, ctx }) => {
       // We only need the ID to look up stats in the service
       return await feedService.getBalancedFeed(ctx.user.uid, input.limit);
    }),

  // 5. IN FOCUS FEED (Narratives)
  getInFocusFeed: publicProcedure
    .input(z.object({ 
        category: z.string().optional(),
        limit: z.number().default(10),
        offset: z.number().default(0)
    }))
    .query(async ({ input }) => {
        return await feedService.getInFocusFeed(input);
    }),

  // 6. TOGGLE SAVE
  toggleSave: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ input, ctx }) => {
       return await feedService.toggleSaveArticle(ctx.user.uid, input.articleId);
    }),

  // 7. GET SAVED ARTICLES
  getSaved: protectedProcedure
    .query(async ({ ctx }) => {
       return await feedService.getSavedArticles(ctx.user.uid);
    }),

  // 8. TRENDING TOPICS
  trending: publicProcedure
    .input(z.object({ limit: z.number().optional().default(12) }))
    .query(async ({ input }) => {
       return await feedService.getTrendingTopics(input.limit);
    }),

  // 9. SMART BRIEFING
  smartBriefing: publicProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ input }) => {
       return await feedService.getSmartBriefing(input.articleId);
    }),

  // 10. PERSONALIZED FEED (For You)
  getPersonalizedFeed: protectedProcedure
    .query(async ({ ctx }) => {
        return await feedService.getPersonalizedFeed(ctx.user.uid);
    }),

  // 11. ADMIN OPERATIONS
  create: protectedProcedure
    .input(z.any()) 
    .mutation(async ({ input }) => {
       return await feedService.createArticle(input);
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: z.any() }))
    .mutation(async ({ input }) => {
       return await feedService.updateArticle(input.id, input.data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
       return await feedService.deleteArticle(input.id);
    })
});
