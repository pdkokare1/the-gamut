import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const articleRouter = router({
  // =================================================================
  // 1. GET MAIN FEED (Infinite Scroll + Filters + Search)
  // =================================================================
  getFeed: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(), // Cursor for infinite scroll (Article ID)
        
        // Filters
        category: z.string().optional(),
        sentiment: z.enum(["Positive", "Negative", "Neutral"]).optional(),
        politicalLean: z.string().optional(),
        country: z.string().optional(),
        
        // Search
        searchQuery: z.string().optional(),
        
        // Toggle for viewing all versions (admin/debug) vs just latest
        includeHistory: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const { 
        limit, 
        cursor, 
        category, 
        sentiment, 
        politicalLean, 
        country, 
        searchQuery,
        includeHistory 
      } = input;

      // Build the WHERE clause dynamically
      const where: any = {};

      // 1. Feed Optimization: Default to only showing the latest version of a story
      if (!includeHistory) {
        where.isLatest = true;
      }

      // 2. Apply Categorical Filters
      if (category && category !== "All") where.category = category;
      if (sentiment) where.sentiment = sentiment;
      if (politicalLean) where.politicalLean = politicalLean;
      if (country && country !== "Global") where.country = country;

      // 3. Apply Text Search (Case Insensitive)
      if (searchQuery) {
        where.OR = [
          { headline: { contains: searchQuery, mode: "insensitive" } },
          { summary: { contains: searchQuery, mode: "insensitive" } },
          { keyFindings: { hasSome: [searchQuery] } } // Basic array matching
        ];
      }

      try {
        const items = await ctx.prisma.article.findMany({
          take: limit + 1, // Fetch one extra to determine next cursor
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { publishedAt: "desc" },
          where,
          // Optimization: Select only fields needed for the Feed Card to reduce payload size
          select: {
            id: true,
            headline: true,
            summary: true,
            imageUrl: true,
            source: true,
            category: true,
            sentiment: true,
            publishedAt: true,
            politicalLean: true,
            biasScore: true,
            credibilityScore: true,
            isLatest: true,
            clusterId: true
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
      } catch (error) {
        // Log the error internally (replace with your logger if needed)
        console.error("Error fetching feed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch article feed",
        });
      }
    }),

  // =================================================================
  // 2. GET SINGLE ARTICLE (Detailed View)
  // =================================================================
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const article = await ctx.prisma.article.findUnique({
        where: { id: input.id },
      });

      if (!article) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Article not found",
        });
      }

      return article;
    }),

  // =================================================================
  // 3. GET RELATED ARTICLES (Cluster Logic)
  // =================================================================
  getRelated: publicProcedure
    .input(z.object({ 
      clusterId: z.number().optional(),
      excludeId: z.string() 
    }))
    .query(async ({ ctx, input }) => {
      if (!input.clusterId) return [];

      const related = await ctx.prisma.article.findMany({
        where: {
          clusterId: input.clusterId,
          id: { not: input.excludeId }, // Don't show the article user is currently reading
          isLatest: true
        },
        take: 5,
        orderBy: { publishedAt: "desc" },
        select: {
          id: true,
          headline: true,
          source: true,
          publishedAt: true,
          sentiment: true,
          imageUrl: true
        }
      });

      return related;
    }),

  // =================================================================
  // 4. GET TRENDING / TOP STORIES (Stats based)
  // =================================================================
  getTrending: publicProcedure
    .query(async ({ ctx }) => {
      // Logic: Fetch articles with high credibility and recent publication
      // Future Optimization: Use an ActivityLog aggregation for "Most Read"
      return await ctx.prisma.article.findMany({
        where: {
          isLatest: true,
          credibilityScore: { gte: 80 }, // High quality only
          publishedAt: {
             gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        take: 5,
        orderBy: { biasScore: 'asc' }, // Show most neutral first
        select: {
          id: true,
          headline: true,
          imageUrl: true,
          category: true
        }
      });
    })
});
