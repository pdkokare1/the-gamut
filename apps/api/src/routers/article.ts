// apps/api/src/routers/article.ts

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { feedService } from '../services/article-service'; // Corrected import path
import { prisma } from '@gamut/db';
import { TRPCError } from '@trpc/server';

export const articleRouter = router({
  
  // --- 1. MAIN FEED (Infinite Scroll + Triple Zone Logic) ---
  getFeed: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10),
      cursor: z.string().nullish(), // For modern infinite scroll
      offset: z.number().optional(), // Fallback for old pagination
      
      // Filters matching your Service capabilities
      category: z.string().optional(),
      politicalLean: z.string().optional(),
      sentiment: z.string().optional(),
      source: z.string().optional(),
      country: z.string().optional(),
      topic: z.string().optional(), // Critical for InFocus/Narrative mapping
      sort: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional()
    }))
    .query(async ({ input, ctx }) => {
      // 1. Fetch User Profile for Personalization (if logged in)
      const userProfile = ctx.user ? await prisma.profile.findUnique({
          where: { userId: ctx.user.uid }
      }) : undefined;

      // 2. Call the Weighted Feed Service
      const result = await feedService.getWeightedFeed(input, userProfile);
      
      let nextCursor: typeof input.cursor = undefined;
      
      // 3. Handle Cursor for Infinite Scroll
      // (If we fetched full limit, use the last item ID as next cursor)
      if (result.articles.length >= input.limit) {
        const lastItem = result.articles[result.articles.length - 1];
        nextCursor = lastItem?.id;
      }

      return {
        items: result.articles,
        nextCursor,
        total: result.pagination.total
      };
    }),

  // --- 2. GET SINGLE ARTICLE (Deep Link) ---
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const article = await prisma.article.findUnique({
        where: { id: input.id }
      });

      if (!article) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
      }

      return article;
    }),

  // --- 3. SMART SEARCH (Vector + Atlas + Text Fallback) ---
  search: publicProcedure
    .input(z.object({ 
        query: z.string().min(2), 
        limit: z.number().default(20) 
    }))
    .query(async ({ input }) => {
      return await feedService.searchArticles(input.query, input.limit);
    }),

  // --- 4. BALANCED FEED (Anti-Echo Chamber) ---
  getBalancedFeed: protectedProcedure
    .input(z.object({ limit: z.number().default(5) }))
    .query(async ({ input, ctx }) => {
       return await feedService.getBalancedFeed(ctx.user.uid, input.limit);
    }),

  // --- 5. IN FOCUS FEED (Narratives) ---
  getInFocusFeed: publicProcedure
    .input(z.object({ 
        category: z.string().optional(),
        limit: z.number().default(10),
        offset: z.number().default(0)
    }))
    .query(async ({ input }) => {
        return await feedService.getInFocusFeed(input);
    }),

  // --- 6. SMART BRIEFING (Restored Controller Logic) ---
  smartBriefing: publicProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ input }) => {
       const article = await prisma.article.findUnique({
           where: { id: input.articleId },
           select: {
               headline: true,
               summary: true,
               keyFindings: true,
               recommendations: true,
               trustScore: true,
               politicalLean: true,
               source: true
           }
       });

       if (!article) {
           throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
       }

       // Format matches the old Controller response explicitly
       return {
           title: article.headline,
           content: article.summary,
           keyPoints: (article.keyFindings && article.keyFindings.length > 0) 
                ? article.keyFindings 
                : ["Analysis in progress. Key findings will appear shortly."],
           recommendations: (article.recommendations && article.recommendations.length > 0)
                ? article.recommendations
                : ["Follow this topic for updates.", "Compare sources to verify details."],
           meta: {
               trustScore: article.trustScore,
               politicalLean: article.politicalLean,
               source: article.source
           }
       };
    }),

  // --- 7. TOGGLE SAVE (Protected) ---
  toggleSave: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ input, ctx }) => {
       return await feedService.toggleSaveArticle(ctx.user.uid, input.articleId);
    }),

  // --- 8. GET SAVED ARTICLES ---
  getSaved: protectedProcedure
    .query(async ({ ctx }) => {
       return await feedService.getSavedArticles(ctx.user.uid);
    }),

  // --- 9. TRENDING TOPICS ---
  trending: publicProcedure
    .input(z.object({ limit: z.number().optional().default(12) }))
    .query(async ({ input }) => {
       return await feedService.getTrendingTopics(input.limit);
    }),

  // --- 10. PERSONALIZED FEED ---
  getPersonalizedFeed: protectedProcedure
    .query(async ({ ctx }) => {
        return await feedService.getPersonalizedFeed(ctx.user.uid);
    }),

  // --- 11. ADMIN OPERATIONS ---
  create: protectedProcedure
    .input(z.any()) 
    .mutation(async ({ input }) => {
       // Ideally, add an admin check here: if (!ctx.user.isAdmin) throw error
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
