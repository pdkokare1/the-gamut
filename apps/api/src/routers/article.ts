import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { feedService } from "../services/feed-algo";

export const articleRouter = router({
  // =================================================================
  // 1. GET MAIN FEED (Smart Weighted Feed)
  // =================================================================
  getFeed: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(), // Used as Offset/Page index for this logic
        offset: z.number().default(0),
        
        // Filters
        category: z.string().optional(),
        politicalLean: z.string().optional(),
        country: z.string().optional(),
        topic: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, offset, category, politicalLean, country, topic } = input;

      // 1. Build Basic Filter Object
      const where: any = {};
      if (category && category !== "All") where.category = category;
      if (politicalLean) where.politicalLean = politicalLean;
      if (country && country !== "Global") where.country = country;
      if (topic) where.clusterTopic = topic;

      // 2. Fetch User Profile (for personalization)
      let userProfile = null;
      if (ctx.user) {
         userProfile = await ctx.prisma.profile.findUnique({
             where: { userId: ctx.user.id }
         });
      }

      try {
        // 3. Call Advanced Feed Service
        const items = await feedService.getWeightedFeed(
            { where, limit, offset }, 
            userProfile
        );

        return {
          items,
          nextCursor: items.length === limit ? offset + limit : undefined,
        };
      } catch (error) {
        console.error("Feed Error:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Feed failed" });
      }
    }),

  // =================================================================
  // 2. INTELLIGENT SEARCH (Vector + Text)
  // =================================================================
  search: publicProcedure
    .input(z.object({ q: z.string() }))
    .query(async ({ ctx, input }) => {
        // Mocking AI service call for embedding - replace with real call
        // const embedding = await aiService.getEmbedding(input.q);
        const embedding = null; // Fallback to text for now

        const results = await feedService.searchArticles(input.q, embedding);
        return { results };
    }),

  // =================================================================
  // 3. TRENDING TOPICS (Hybrid Deduplication)
  // =================================================================
  getTrending: publicProcedure
    .query(async () => {
        return await feedService.getTrendingTopics();
    }),

  // =================================================================
  // 4. STANDARD CRUD (Keep for Single Article View)
  // =================================================================
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.prisma.article.findUnique({ where: { id: input.id } });
    })
});
