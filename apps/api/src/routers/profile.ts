// apps/api/src/routers/profile.ts
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { userService } from "../services/user-service";
import { gamificationService } from "../services/gamification";

export const profileRouter = router({
  // =================================================================
  // 1. GET / CREATE PROFILE
  // Handles initial fetch. If profile missing (new Firebase user), creates it.
  // =================================================================
  getMe: protectedProcedure.query(async ({ ctx }) => {
    try {
      let profile = await ctx.prisma.profile.findUnique({
        where: { userId: ctx.user.id },
        include: { badges: true } // Include badges in initial load
      });

      if (!profile) {
        // Auto-create if not exists (First login)
        profile = await ctx.prisma.profile.create({
          data: {
            userId: ctx.user.id,
            email: ctx.user.email,
            username: ctx.user.email?.split('@')[0] || "User",
            leanExposure: { Left: 33, Center: 34, Right: 33 }, // Default neutral start
            topicInterest: {},
          },
          include: { badges: true }
        });
      }

      return { profile };
    } catch (error) {
      console.error("Profile Fetch Error:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch profile" });
    }
  }),

  // =================================================================
  // 2. UPDATE PROFILE (Onboarding / Settings)
  // Replaces: profileController.updateProfile
  // =================================================================
  updateProfile: protectedProcedure
    .input(z.object({
      username: z.string().min(3).optional(),
      notificationsEnabled: z.boolean().optional(),
      fcmToken: z.string().optional(), // For Push Notifications
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.prisma.profile.update({
        where: { userId: ctx.user.id },
        data: input
      });
    }),

  // =================================================================
  // 3. SYNC ACTIVITY & UPDATE STATS
  // This is the "Heartbeat" of personalization.
  // Called when user reads an article. Updates lean scores + checks badges.
  // Replaces: activityController.logActivity
  // =================================================================
  syncActivity: protectedProcedure
    .input(z.object({
      articleId: z.string(),
      action: z.enum(["view", "share", "save", "read_full"]),
      timeSpent: z.number().default(0) // Seconds
    }))
    .mutation(async ({ ctx, input }) => {
      const { articleId, action, timeSpent } = input;

      // 1. Log the raw activity
      await ctx.prisma.activityLog.create({
        data: {
          userId: ctx.user.id,
          articleId,
          action: action as any, // Cast to enum
          timestamp: new Date()
        }
      });

      // 2. Fetch Article Metadata (to know political lean/category)
      const article = await ctx.prisma.article.findUnique({
        where: { id: articleId },
        select: { politicalLean: true, category: true }
      });

      if (!article) return { success: true };

      // 3. Update User Personalization Stats (The Bubble)
      // Only update stats on meaningful interaction (view > 10s or share/read_full)
      if (action === "read_full" || action === "share" || (action === "view" && timeSpent > 10)) {
        await userService.updateUserStats(ctx.user.id, article);
      }

      // 4. Check Gamification (Badges/Streaks)
      // We run this async so we don't block the UI response
      const newBadges = await gamificationService.checkAchievements(ctx.user.id);

      return { 
        success: true, 
        newBadges: newBadges.length > 0 ? newBadges : undefined 
      };
    }),

  // =================================================================
  // 4. GET USER STATS
  // Used for the "Your News Bubble" Visualization
  // =================================================================
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.prisma.profile.findUnique({
      where: { userId: ctx.user.id },
      select: {
        leanExposure: true,
        topicInterest: true,
        articlesViewedCount: true,
        currentStreak: true,
        badges: true
      }
    });

    return {
      stats: profile,
      bubbleData: profile?.leanExposure // { Left: 50, Center: 20, Right: 30 }
    };
  })
});
