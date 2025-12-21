import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const profileRouter = router({
  // 1. Get My Profile (Creates one if it doesn't exist)
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const { uid, email, name } = ctx.user; // From Firebase

    // Try to find existing profile
    let profile = await ctx.prisma.profile.findUnique({
      where: { userId: uid },
      include: {
        savedArticles: true, // Fetch actual article data
      },
    });

    // If first login, create profile automatically
    if (!profile) {
      profile = await ctx.prisma.profile.create({
        data: {
          userId: uid,
          email: email || '',
          username: name || `User_${uid.slice(0, 5)}`,
          savedArticles: { connect: [] },
          // Default Gamification stats
          currentStreak: 1,
          lastActiveDate: new Date(),
        },
        include: { savedArticles: true },
      });
    } else {
        // --- RESTORED LOGIC: Streak Calculation ---
        const lastActive = new Date(profile.lastActiveDate);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - lastActive.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let newStreak = profile.currentStreak;
        
        // If active yesterday (diffDays approx 1) or today, keep streak. 
        // If gap > 1 day, reset.
        if (diffDays > 2) { 
            newStreak = 1; 
        } else if (diffDays >= 1 && diffDays <= 2) {
            newStreak += 1;
        }

        // Update activity timestamp if it's a new day
        if (diffDays >= 1) {
            profile = await ctx.prisma.profile.update({
                where: { id: profile.id },
                data: {
                    lastActiveDate: now,
                    currentStreak: newStreak
                },
                include: { savedArticles: true }
            });
        }
    }

    return profile;
  }),

  // 2. Toggle Saved Article
  toggleSave: protectedProcedure
    .input(z.object({ articleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.uid;

      const profile = await ctx.prisma.profile.findUnique({
        where: { userId },
        include: { savedArticles: true },
      });

      if (!profile) throw new TRPCError({ code: 'NOT_FOUND' });

      const isSaved = profile.savedArticles.some((a) => a.id === input.articleId);

      // Connect (Save) or Disconnect (Unsave)
      const updatedProfile = await ctx.prisma.profile.update({
        where: { userId },
        data: {
          savedArticles: isSaved
            ? { disconnect: { id: input.articleId } }
            : { connect: { id: input.articleId } },
        },
        include: { savedArticles: true }
      });

      return { 
        isSaved: !isSaved,
        savedArticleIds: updatedProfile.savedArticles.map(a => a.id)
      };
    }),
});
