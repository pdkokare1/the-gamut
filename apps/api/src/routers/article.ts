// apps/api/src/routers/article.ts
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { feedService } from "../services/feed-service";

export const articleRouter = router({
  // =================================================================
  // 1. MAIN FEED (Smart Weighted Feed)
  // Replaces: articleController.getMainFeed
  // =================================================================
  getFeed: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(), // Used for infinite scroll (ID based)
        
        // Filters
        category: z.string().optional(),
        politicalLean: z.string().optional(),
        country: z.string().optional(),
        topic: z.string().optional(), // For InFocus context
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, category, politicalLean, country, topic } = input;

      try {
        // Fetch User Profile if logged in for personalization
        let userProfile = null;
        if (ctx.user) {
           userProfile = await ctx.prisma.profile.findUnique({
               where: { userId: ctx.user.id }
           });
        }

        const items = await feedService.getWeightedFeed(
            { 
              limit, 
              cursor, 
              category: category === "All" ? undefined : category,
              politicalLean,
              country,
              topic
            }, 
            userProfile
        );

        let nextCursor: typeof cursor = undefined;
        if (items.length > limit) {
          const nextItem = items.pop(); // Remove the extra item used for cursor
          nextCursor = nextItem?.id;
        }

        return {
          items,
          nextCursor,
        };
      } catch (error) {
        console.error("Feed Error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch feed" });
      }
    }),

  // =================================================================
  // 2. IN FOCUS FEED (Narratives)
  // Replaces: articleController.getInFocusFeed
  // =================================================================
  getInFocus: publicProcedure
    .input(z.object({
      limit: z.number().default(5)
    }))
    .query(async ({ ctx, input }) => {
      try {
        const narratives = await feedService.getInFocusNarratives(input.limit);
        return { data: narratives };
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch narratives" });
      }
    }),

  // =================================================================
  // 3. BALANCED FEED (Anti-Echo Chamber)
  // Replaces: articleController.getBalancedFeed
  // =================================================================
  getBalanced: protectedProcedure
    .input(z.object({
      limit: z.number().default(10)
    }))
    .query(async ({ ctx, input }) => {
      try {
        const profile = await ctx.prisma.profile.findUnique({
          where: { userId: ctx.user.id }
        });
        
        if (!profile) throw new Error("Profile not found");

        const articles = await feedService.getBalancedFeed(profile, input.limit);
        return { data: articles };
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch balanced feed" });
      }
    }),

  // =================================================================
  // 4. INTELLIGENT SEARCH (Vector + Text)
  // Replaces: articleController.searchArticles
  // =================================================================
  search: publicProcedure
    .input(z.object({ q: z.string() }))
    .query(async ({ ctx, input }) => {
        try {
          const results = await feedService.smartSearch(input.q);
          return { results };
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Search failed" });
        }
    }),

  // =================================================================
  // 5. SAVED ARTICLES
  // Replaces: articleController.getSavedArticles & toggleSave
  // =================================================================
  getSaved: protectedProcedure
    .query(async ({ ctx }) => {
      const profile = await ctx.prisma.profile.findUnique({
        where: { userId: ctx.user.id },
        include: { savedArticles: true } // Relation populate
      });
      return { data: profile?.savedArticles || [] };
    }),

  toggleSave: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await feedService.toggleSaveArticle(ctx.user.id, input.articleId);
    }),

  // =================================================================
  // 6. SMART BRIEFING
  // Replaces: articleController.getSmartBriefing
  // =================================================================
  getSmartBriefing: publicProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const article = await ctx.prisma.article.findUnique({
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });
      }

      return {
        title: article.headline,
        content: article.summary,
        keyPoints: article.keyFindings.length > 0 
          ? article.keyFindings 
          : ["Analysis in progress..."],
        recommendations: article.recommendations,
        meta: {
          trustScore: article.trustScore,
          politicalLean: article.politicalLean,
          source: article.source
        }
      };
    }),
});
