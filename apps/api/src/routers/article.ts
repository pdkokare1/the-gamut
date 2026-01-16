import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { searchService } from '../services/search';

export const articleRouter = router({
  // --- 1. Main Feed (Infinite Scroll with Full Filters) ---
  getFeed: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
        category: z.string().optional(),
        sentiment: z.enum(['Positive', 'Negative', 'Neutral']).optional(),
        country: z.string().optional(),
        // Ported Filters
        politicalLean: z.enum(['Left', 'Center', 'Right']).optional(),
        source: z.string().optional(),
        minTrustScore: z.number().min(0).max(100).optional(),
        topic: z.string().optional(), // For InFocus/Topic specific feeds
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, category, sentiment, country, politicalLean, source, minTrustScore, topic } = input;

      const whereClause: any = {
        ...(category && category !== 'All Categories' ? { category } : {}),
        ...(sentiment ? { sentiment } : {}),
        ...(country && country !== 'Global' ? { country } : {}),
        ...(politicalLean ? { politicalLean } : {}),
        ...(source ? { source } : {}),
        ...(minTrustScore ? { trustScore: { gte: minTrustScore } } : {}),
        ...(topic ? { 
           OR: [
             { clusterTopic: topic },
             { primaryNoun: topic }
           ]
        } : {})
      };

      const items = await ctx.prisma.article.findMany({
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { publishedAt: 'desc' },
        where: whereClause,
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
          politicalLean: true,
          audioUrl: true,
        }
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop(); 
        nextCursor = nextItem!.id;
      }

      return { items, nextCursor };
    }),

  // --- 2. Balanced Feed (Anti-Echo Chamber) ---
  // Fetches equal parts Left, Center, and Right content
  getBalancedFeed: publicProcedure
    .input(z.object({ limit: z.number().default(5) })) // Limit per lean (total = 3x limit)
    .query(async ({ ctx, input }) => {
      const [left, center, right] = await Promise.all([
        ctx.prisma.article.findMany({
          where: { politicalLean: 'Left', trustScore: { gte: 60 } },
          take: input.limit,
          orderBy: { publishedAt: 'desc' }
        }),
        ctx.prisma.article.findMany({
          where: { politicalLean: 'Center', trustScore: { gte: 60 } },
          take: input.limit,
          orderBy: { publishedAt: 'desc' }
        }),
        ctx.prisma.article.findMany({
          where: { politicalLean: 'Right', trustScore: { gte: 60 } },
          take: input.limit,
          orderBy: { publishedAt: 'desc' }
        })
      ]);

      // Interleave results for a mixed view
      const mixed = [];
      const maxLength = Math.max(left.length, center.length, right.length);
      for (let i = 0; i < maxLength; i++) {
        if (center[i]) mixed.push(center[i]);
        if (left[i]) mixed.push(left[i]);
        if (right[i]) mixed.push(right[i]);
      }

      return mixed;
    }),

  // --- 3. Trending Topics ---
  getTrendingTopics: publicProcedure
    .query(async ({ ctx }) => {
      // Group by clusterTopic to find hot stories
      // Note: This is an expensive aggregation, ideally cached
      const topics = await ctx.prisma.article.groupBy({
        by: ['clusterTopic'],
        _count: { clusterTopic: true },
        where: { 
          publishedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24h
          clusterTopic: { not: null }
        },
        orderBy: { _count: { clusterTopic: 'desc' } },
        take: 10
      });
      return topics.map(t => ({ topic: t.clusterTopic, count: t._count.clusterTopic }));
    }),

  // --- 4. Single Article Analysis ---
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const article = await ctx.prisma.article.findUnique({
        where: { id: input.id },
      });

      if (!article) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });
      }

      // Fire-and-forget analytics
      if (ctx.user) {
        ctx.prisma.profile.update({
            where: { userId: ctx.user.uid },
            data: { articlesViewedCount: { increment: 1 }, lastActiveDate: new Date() }
        }).catch(() => {}); // Ignore error
      }

      return article;
    }),

  // --- 5. Smart Briefing (AI Summary) ---
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

      if (!article) throw new TRPCError({ code: 'NOT_FOUND', message: 'Article not found' });

      return {
        title: article.headline,
        content: article.summary,
        keyPoints: article.keyFindings.length > 0 ? article.keyFindings : ["Analysis in progress."],
        recommendations: article.recommendations.length > 0 ? article.recommendations : ["Compare sources."],
        meta: {
          trustScore: article.trustScore,
          politicalLean: article.politicalLean,
          source: article.source
        }
      };
    }),

  // --- 6. Search ---
  search: publicProcedure
    .input(z.object({ term: z.string() }))
    .query(async ({ input }) => {
      return await searchService.search(input.term);
    }),

  // --- 7. Related Articles ---
  getRelated: publicProcedure
    .input(z.object({ 
      clusterId: z.number().nullable().optional(),
      category: z.string(),
      currentArticleId: z.string() 
    }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.article.findMany({
        where: {
          OR: [
             { clusterId: input.clusterId ? input.clusterId : undefined },
             { category: input.category }
          ],
          id: { not: input.currentArticleId }
        },
        take: 5,
        orderBy: { publishedAt: 'desc' }
      });
    }),

  // --- 8. Saved Articles (Protected) ---
  getSaved: protectedProcedure
    .query(async ({ ctx }) => {
      const profile = await ctx.prisma.profile.findUnique({
        where: { userId: ctx.user.uid },
        include: { savedArticles: true }
      });
      return profile?.savedArticles || [];
    }),

  // --- 9. Toggle Save (Protected Mutation) ---
  toggleSave: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.profile.findUnique({
        where: { userId: ctx.user.uid },
        select: { savedArticleIds: true }
      });

      if (!profile) throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });

      const isSaved = profile.savedArticleIds.includes(input.articleId);

      // Prisma connect/disconnect logic for arrays of IDs (MongoDB specific) or Relations
      const updateData = isSaved 
        ? { disconnect: { id: input.articleId } } 
        : { connect: { id: input.articleId } };

      const updatedProfile = await ctx.prisma.profile.update({
        where: { userId: ctx.user.uid },
        data: {
          savedArticles: updateData
        },
        include: { savedArticles: true } // Return updated list
      });

      return {
        isSaved: !isSaved,
        savedArticles: updatedProfile.savedArticles
      };
    })
});
