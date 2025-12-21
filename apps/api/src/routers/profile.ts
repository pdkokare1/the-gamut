import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const profileRouter = router({
  // 1. Get My Profile (Creates one if it doesn't exist)
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const { uid, email, name, picture } = ctx.user; // From Firebase

    // Try to find existing profile
    let profile = await ctx.prisma.profile.findUnique({
      where: { userId: uid },
      include: {
        savedArticles: true, // Fetch actual article data, not just IDs
      },
    });

    // If first login, create profile automatically
    if (!profile) {
      profile = await ctx.prisma.profile.create({
        data: {
          userId: uid,
          email: email || '',
          username: name || `User_${uid.slice(0, 5)}`,
          // Initialize empty defaults
          savedArticles: { connect: [] },
        },
        include: { savedArticles: true },
      });
    }

    return profile;
  }),

  // 2. Toggle Saved Article
  toggleSave: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.uid;

      // Check if already saved
      const profile = await ctx.prisma.profile.findUnique({
        where: { userId },
        include: { savedArticles: true },
      });

      if (!profile) throw new TRPCError({ code: 'NOT_FOUND' });

      const isSaved = profile.savedArticles.some((a) => a.id === input.articleId);

      // Connect (Save) or Disconnect (Unsave)
      await ctx.prisma.profile.update({
        where: { userId },
        data: {
          savedArticles: isSaved
            ? { disconnect: { id: input.articleId } }
            : { connect: { id: input.articleId } },
        },
      });

      return { isSaved: !isSaved };
    }),
});
