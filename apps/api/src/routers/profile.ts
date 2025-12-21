import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { gamificationService } from '../services/gamification'; // New Import

export const profileRouter = router({
  // 1. Get My Profile
  getMe: protectedProcedure.query(async ({ ctx }) => {
    const { uid, email, name } = ctx.user;

    let profile = await ctx.prisma.profile.findUnique({
      where: { userId: uid },
      include: { savedArticles: true },
    });

    if (!profile) {
      profile = await ctx.prisma.profile.create({
        data: {
          userId: uid,
          email: email || '',
          username: name || `User_${uid.slice(0, 5)}`,
          savedArticles: { connect: [] },
          currentStreak: 1,
          lastActiveDate: new Date(),
        },
        include: { savedArticles: true },
      });
    } else {
        // Streak Logic
        const lastActive = new Date(profile.lastActiveDate);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - lastActive.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let newStreak = profile.currentStreak;
        if (diffDays > 2) { 
            newStreak = 1; 
        } else if (diffDays >= 1 && diffDays <= 2) {
            newStreak += 1;
        }

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

    // --- NEW: Check for Badges on Load ---
    // This ensures if they hit a milestone (like a streak), they see it immediately
    await gamificationService.checkAndAwardBadges(uid);
    
    // Re-fetch to get latest badges
    return ctx.prisma.profile.findUnique({
        where: { userId: uid },
        include: { savedArticles: true }
    });
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

      const updatedProfile = await ctx.prisma.profile.update({
        where: { userId },
        data: {
          savedArticles: isSaved
            ? { disconnect: { id: input.articleId } }
            : { connect: { id: input.articleId } },
        },
        include: { savedArticles: true }
      });

      // --- NEW: Check Badges (e.g. "Curator") ---
      // We run this asynchronously
      gamificationService.checkAndAwardBadges(userId).catch(console.error);

      return { 
        isSaved: !isSaved,
        savedArticleIds: updatedProfile.savedArticles.map(a => a.id)
      };
    }),
});
