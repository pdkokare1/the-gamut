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
           // We can include related articles or checking if saved here if needed
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
  // Protected: Only for logged-in users with history
  getBalancedFeed: protectedProcedure
    .input(z.object({ limit: z.number().default(5) }))
    .query(async ({ input, ctx }) => {
       const userProfile = await prisma.profile.findUnique({
           where: { userId: ctx.user.uid }
       });
       
       return await feedService.getBalancedFeed(userProfile, input.limit);
    }),

  // 5. TOGGLE SAVE
  toggleSave: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ input, ctx }) => {
       return await feedService.toggleSaveArticle(ctx.user.uid, input.articleId);
    }),

  // 6. GENERATE AUDIO (TTS)
  // Connects to your TTS logic (we will port ttsService later)
  getAudio: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ input }) => {
       const article = await prisma.article.findUnique({ where: { id: input.articleId } });
       if (!article) throw new TRPCError({ code: 'NOT_FOUND' });
       
       if (article.audioUrl) return { audioUrl: article.audioUrl };

       // Placeholder: We will hook up the actual TTS Service in the next step
       return { audioUrl: null, status: "pending" };
    }),

  // 7. GET SAVED ARTICLES
  // Restore functionality from articleController.getSavedArticles
  getSaved: protectedProcedure
    .query(async ({ ctx }) => {
       return await feedService.getSavedArticles(ctx.user.uid);
    }),

  // 8. TRENDING TOPICS
  // Restore functionality from articleController.getTrendingTopics
  trending: publicProcedure
    .input(z.object({ limit: z.number().optional().default(8) }))
    .query(async ({ input }) => {
       return await feedService.getTrendingTopics(input.limit);
    }),

  // 9. SMART BRIEFING
  // Restore functionality from articleController.getSmartBriefing
  smartBriefing: publicProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ input }) => {
       return await feedService.getSmartBriefing(input.articleId);
    }),

  // 10. ADMIN: CREATE ARTICLE
  create: protectedProcedure
    .input(z.any()) // Replace with strict validation schema later
    .mutation(async ({ input, ctx }) => {
       // Ideally check for Admin role here: if (ctx.user.role !== 'ADMIN') ...
       return await feedService.createArticle(input);
    }),

  // 11. ADMIN: UPDATE ARTICLE
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: z.any() }))
    .mutation(async ({ input }) => {
       return await feedService.updateArticle(input.id, input.data);
    }),

  // 12. ADMIN: DELETE ARTICLE
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
       return await feedService.deleteArticle(input.id);
    })
});
