import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { gamificationService } from '../services/gamification';

export const profileRouter = router({
  // 1. GET CURRENT PROFILE (Enriched with Gamification & Stats)
  getMe: protectedProcedure.query(async ({ ctx }) => {
    let profile = await ctx.prisma.profile.findUnique({
      where: { userId: ctx.user.uid },
    });

    if (!profile) {
      // Auto-create for new users
      profile = await ctx.prisma.profile.create({
        data: {
          userId: ctx.user.uid,
          email: ctx.user.email || '',
          username: ctx.user.email?.split('@')[0] || `user_${Date.now()}`,
          // Initialize stats
          leanExposure: { Left: 0, Center: 0, Right: 0 },
          topicInterest: {},
          badges: []
        },
      });
    }

    // Trigger streak check on load (passive check)
    // We don't await this to keep the UI snappy
    gamificationService.updateStreak(ctx.user.uid).catch(console.error);

    // Transform data to match Frontend Expectations
    return {
      ...profile,
      stats: {
        articlesViewed: profile.articlesViewedCount,
        totalTimeSpent: profile.totalTimeSpent,
        leanExposure: profile.leanExposure as Record<string, number>,
        topicInterest: profile.topicInterest as Record<string, number>,
      },
      gamification: {
        streak: profile.currentStreak,
        badges: profile.badges || [],
        level: Math.floor(profile.articlesViewedCount / 10) + 1
      }
    };
  }),

  // 2. UPDATE BASIC PROFILE
  update: protectedProcedure
    .input(
      z.object({
        username: z.string().min(3).optional(),
        notificationsEnabled: z.boolean().optional(),
        fcmToken: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.username) {
        const existing = await ctx.prisma.profile.findUnique({
          where: { username: input.username },
        });
        if (existing && existing.userId !== ctx.user.uid) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Username already taken' });
        }
      }

      return ctx.prisma.profile.update({
        where: { userId: ctx.user.uid },
        data: input,
      });
    }),

  // 3. TRACK ACTIVITY (Heartbeat for Echo Chamber & Time)
  // Replaces logic from userStatsModel
  trackActivity: protectedProcedure
    .input(z.object({
      articleId: z.string().optional(),
      timeSpentSeconds: z.number().min(1),
      politicalLean: z.enum(['Left', 'Center', 'Right']).optional(),
      topic: z.string().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const { timeSpentSeconds, politicalLean, topic } = input;
      
      // 1. Fetch current stats
      const profile = await ctx.prisma.profile.findUnique({
        where: { userId: ctx.user.uid },
        select: { leanExposure: true, topicInterest: true }
      });
      
      if (!profile) return;

      // 2. Prepare Updates
      const currentLean = (profile.leanExposure as any) || { Left: 0, Center: 0, Right: 0 };
      const currentTopics = (profile.topicInterest as any) || {};

      // Update Lean Exposure
      if (politicalLean) {
        currentLean[politicalLean] = (currentLean[politicalLean] || 0) + (timeSpentSeconds / 60); // Store in minutes
      }

      // Update Topic Interest
      if (topic) {
        currentTopics[topic] = (currentTopics[topic] || 0) + (timeSpentSeconds / 60);
      }

      // 3. Save to DB
      await ctx.prisma.profile.update({
        where: { userId: ctx.user.uid },
        data: {
            totalTimeSpent: { increment: timeSpentSeconds },
            leanExposure: currentLean,
            topicInterest: currentTopics,
            articlesViewedCount: input.articleId ? { increment: 1 } : undefined // Only increment count if articleId provided (on open)
        }
      });

      // 4. Check Badges
      if (input.articleId) {
          await gamificationService.checkReadBadges(ctx.user.uid);
      }
      
      return { success: true };
    }),

  // 4. TOGGLE SAVED ARTICLE
  toggleSave: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.profile.findUnique({
        where: { userId: ctx.user.uid },
        select: { savedArticleIds: true },
      });

      if (!profile) throw new TRPCError({ code: 'NOT_FOUND' });

      const isSaved = profile.savedArticleIds.includes(input.articleId);

      await ctx.prisma.profile.update({
        where: { userId: ctx.user.uid },
        data: {
          savedArticles: isSaved
            ? { disconnect: { id: input.articleId } }
            : { connect: { id: input.articleId } },
        },
      });

      return { isSaved: !isSaved };
    }),

  // 5. GET SAVED ARTICLES
  getSavedArticles: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.prisma.profile.findUnique({
      where: { userId: ctx.user.uid },
      select: {
        savedArticles: {
          orderBy: { publishedAt: 'desc' },
          select: {
            id: true,
            headline: true,
            summary: true,
            imageUrl: true,
            source: true,
            publishedAt: true,
            category: true,
            sentiment: true,
          },
        },
      },
    });

    return profile?.savedArticles || [];
  }),

  // 6. CHECK USERNAME (Public)
  checkUsername: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const count = await ctx.prisma.profile.count({
        where: { username: input.username },
      });
      return { available: count === 0 };
    }),
});
