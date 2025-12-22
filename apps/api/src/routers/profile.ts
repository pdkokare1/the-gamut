import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const profileRouter = router({
  // 1. GET CURRENT PROFILE
  // Replaces: GET /api/profile/me
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.prisma.profile.findUnique({
      where: { userId: ctx.user.uid },
    });

    if (!profile) {
      // Auto-create profile if it doesn't exist (First time login)
      // This handles the "Sign Up" flow seamlessly
      return ctx.prisma.profile.create({
        data: {
          userId: ctx.user.uid,
          email: ctx.user.email || '',
          username: ctx.user.email?.split('@')[0] || `user_${Date.now()}`,
        },
      });
    }

    return profile;
  }),

  // 2. UPDATE PROFILE
  // Replaces: PUT /api/profile/update
  update: protectedProcedure
    .input(
      z.object({
        username: z.string().min(3).optional(),
        notificationsEnabled: z.boolean().optional(),
        fcmToken: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check uniqueness if updating username
      if (input.username) {
        const existing = await ctx.prisma.profile.findUnique({
          where: { username: input.username },
        });
        if (existing && existing.userId !== ctx.user.uid) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Username already taken',
          });
        }
      }

      return ctx.prisma.profile.update({
        where: { userId: ctx.user.uid },
        data: input,
      });
    }),

  // 3. TOGGLE SAVED ARTICLE
  // Replaces: POST /api/profile/save and DELETE /api/profile/save
  toggleSave: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // First, check if it's currently saved
      const profile = await ctx.prisma.profile.findUnique({
        where: { userId: ctx.user.uid },
        select: { savedArticleIds: true },
      });

      if (!profile) throw new TRPCError({ code: 'NOT_FOUND' });

      const isSaved = profile.savedArticleIds.includes(input.articleId);

      // Perform the update
      await ctx.prisma.profile.update({
        where: { userId: ctx.user.uid },
        data: {
          savedArticles: isSaved
            ? { disconnect: { id: input.articleId } } // Remove if saved
            : { connect: { id: input.articleId } },   // Add if not saved
        },
      });

      return { isSaved: !isSaved };
    }),

  // 4. GET SAVED ARTICLES
  // Replaces: GET /api/profile/saved
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
  
  // 5. CHECK USERNAME (Public)
  // Used during onboarding to show "Username available" green checkmark
  checkUsername: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const count = await ctx.prisma.profile.count({
        where: { username: input.username },
      });
      return { available: count === 0 };
    }),
});
