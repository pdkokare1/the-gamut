// apps/api/src/routers/article.ts
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { feedService } from '../services/feed-service';
import { prisma } from '@gamut/db';
import { TRPCError } from '@trpc/server';
import aiService from '../services/ai';

export const articleRouter = router({
  
  // 1. MAIN FEED (Infinite Scroll)
  getFeed: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10),
      cursor: z.string().nullish(), // For pagination
      category: z.string().optional(),
      politicalLean: z.string().optional(),
      country: z.string().optional(),
      topic: z.string().optional()
    }))
    .query(async ({ input, ctx }) => {
      // Pass user profile if logged in (for personalization)
      const userProfile = ctx.user ? await prisma.profile.findUnique({
          where: { userId: ctx.user.uid }
      }) : null;

      const items = await feedService.getWeightedFeed(input, userProfile);
      
      let nextCursor: typeof input.cursor = undefined;
      if (items.length > input.limit) {
        const nextItem = items.pop(); // Remove the extra item
        nextCursor = nextItem?.id;
      }

      return {
        items,
        nextCursor
      };
    }),

  // 2. GET SINGLE ARTICLE (With AI Analysis)
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const article = await prisma.article.findUnique({
        where: { id: input.id },
        include: {
           // Include explicit relations if necessary for frontend
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
    .input(z.object({ query: z.string().min(2) }))
    .query(async ({ input }) => {
      return await feedService.smartSearch(input.query);
    }),

  // 4. BALANCED FEED (Echo Chamber Breaker)
  getBalancedFeed: protectedProcedure
    .input(z.object({ limit: z.number().default(5) }))
    .query(async ({ input, ctx }) => {
       const userProfile = await prisma.profile.findUnique({
           where: { userId: ctx.user.uid }
       });
       
       return await feedService.getBalancedFeed(userProfile, input.limit);
    }),

  // 5. IN FOCUS FEED (Missing Feature Restored)
  // Used for the "Narratives" or "In Focus" bar
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

  // 7. GENERATE AUDIO (TTS)
  getAudio: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ input }) => {
       const article = await prisma.article.findUnique({ where: { id: input.articleId } });
       if (!article) throw new TRPCError({ code: 'NOT_FOUND' });
       
       if (article.audioUrl) return { audioUrl: article.audioUrl };

       // Placeholder: Hooks into future ttsService
       return { audioUrl: null, status: "pending" };
    }),

  // 8. GET SAVED ARTICLES
  getSaved: protectedProcedure
    .query(async ({ ctx }) => {
       return await feedService.getSavedArticles(ctx.user.uid);
    }),

  // 9. TRENDING TOPICS
  trending: publicProcedure
    .input(z.object({ limit: z.number().optional().default(8) }))
    .query(async ({ input }) => {
       return await feedService.getTrendingTopics(input.limit);
    }),

  // 10. SMART BRIEFING
  smartBriefing: publicProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ input }) => {
       return await feedService.getSmartBriefing(input.articleId);
    }),

  // 11. ADMIN OPERATIONS
  create: protectedProcedure
    .input(z.any()) 
    .mutation(async ({ input, ctx }) => {
       // Add Admin Check here in future
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
