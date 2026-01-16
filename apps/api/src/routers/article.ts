import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { searchService } from '../services/search';

export const articleRouter = router({
  // --- 1. Main Feed ---
  getFeed: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
        category: z.string().optional(),
        sentiment: z.enum(['Positive', 'Negative', 'Neutral']).optional(),
        country: z.string().optional(),
        politicalLean: z.enum(['Left', 'Center', 'Right']).optional(),
        source: z.string().optional(),
        minTrustScore: z.number().min(0).max(100).optional(),
        topic: z.string().optional(),
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
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop(); 
        nextCursor = nextItem!.id;
      }

      return { items, nextCursor };
    }),

  // --- 2. Balanced Feed ---
  getBalancedFeed: publicProcedure
    .input(z.object({ limit: z.number().default(5) }))
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

      const mixed = [];
      const maxLength = Math.max(left.length, center.length, right.length);
      for (let i = 0; i < maxLength; i++) {
        if (center[i]) mixed.push(center[i]);
        if (left[i]) mixed.push(left[i]);
        if (right[i]) mixed.push(right[i]);
      }
      return mixed;
    }),

  // --- 3. Topic Perspectives (Compare Coverage) ---
  // Finds articles on the same topic from different viewpoints
  getTopicPerspectives: publicProcedure
    .input(z.object({ 
      topic: z.string().nullable().optional(),
      category: z.string().optional(),
      currentArticleId: z.string() 
    }))
    .query(async ({ ctx, input }) => {
      // Base criteria: Must be recently published
      const timeLimit = new Date();
      timeLimit.setDate(timeLimit.getDate() - 3); // Last 3 days

      const baseWhere = {
        id: { not: input.currentArticleId },
        publishedAt: { gte: timeLimit }
      };

      // Strategy 1: Match by Cluster Topic (Best)
      // Strategy 2: Match by Category (Fallback)
      const topicFilter = input.topic ? { clusterTopic: input.topic } : { category: input.category };

      const [left, center, right] = await Promise.all([
        ctx.prisma.article.findFirst({
            where: { ...baseWhere, ...topicFilter, politicalLean: 'Left' },
            orderBy: { trustScore: 'desc' }
        }),
        ctx.prisma.article.findFirst({
            where: { ...baseWhere, ...topicFilter, politicalLean: 'Center' },
            orderBy: { trustScore: 'desc' }
        }),
        ctx.prisma.article.findFirst({
            where: { ...baseWhere, ...topicFilter, politicalLean: 'Right' },
            orderBy: { trustScore: 'desc' }
        })
      ]);

      return { left, center, right };
    }),

  // --- 4. Trending Topics ---
  getTrendingTopics: publicProcedure
    .query(async ({ ctx }) => {
      const topics = await ctx.prisma.article.groupBy({
        by: ['clusterTopic'],
        _count: { clusterTopic: true },
        where: { 
          publishedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          clusterTopic: { not: null }
        },
        orderBy: { _count: { clusterTopic: 'desc' } },
        take: 10
      });
      return topics.map(t => ({ topic: t.clusterTopic, count: t._count.clusterTopic }));
    }),

  // --- 5. Single Article ---
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const article = await ctx.prisma.article.findUnique({
        where: { id: input.id },
      });

      if (!article) throw new TRPCError({ code: 'NOT_FOUND' });

      // Analytics
      if (ctx.user) {
        ctx.prisma.profile.update({
            where: { userId: ctx.user.uid },
            data: { articlesViewedCount: { increment: 1 }, lastActiveDate: new Date() }
        }).catch(() => {});
      }
      return article;
    }),

  // --- 6. Smart Briefing ---
  getSmartBriefing: publicProcedure
    .input(z.object({ articleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const article = await ctx.prisma.article.findUnique({
        where: { id: input.articleId }
      });

      if (!article) throw new TRPCError({ code: 'NOT_FOUND' });

      return {
        title: article.headline,
        content: article.summary,
        keyPoints: article.keyFindings,
        recommendations: article.recommendations,
        meta: {
          trustScore: article.trustScore,
          politicalLean: article.politicalLean,
          source: article.source,
          sentiment: article.sentiment
        }
      };
    }),

  // --- 7. Search ---
  search: publicProcedure
    .input(z.object({ term: z.string() }))
    .query(async ({ input }) => {
      return await searchService.search(input.term);
    }),

  // --- 8. User Actions (Save) ---
  getSaved: protectedProcedure
    .query(async ({ ctx }) => {
      const profile = await ctx.prisma.profile.findUnique({
        where: { userId: ctx.user.uid },
        include: { savedArticles: true }
      });
      return profile?.savedArticles || [];
    }),

  toggleSave: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.profile.findUnique({
        where: { userId: ctx.user.uid },
        select: { savedArticleIds: true }
      });

      if (!profile) throw new TRPCError({ code: 'NOT_FOUND' });

      const isSaved = profile.savedArticleIds.includes(input.articleId);

      const updatedProfile = await ctx.prisma.profile.update({
        where: { userId: ctx.user.uid },
        data: {
          savedArticles: isSaved ? { disconnect: { id: input.articleId } } : { connect: { id: input.articleId } }
        },
        include: { savedArticles: true }
      });

      return { isSaved: !isSaved, savedArticles: updatedProfile.savedArticles };
    })
});
