// apps/api/src/routers/profile.ts
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { userService } from "../services/user-service";
import { gamificationService } from "../services/gamification";
import { firebaseAdmin } from "../config"; 

export const profileRouter = router({
  // =================================================================
  // 1. GET / CREATE PROFILE (With "Orphan" Relinking Logic)
  // Handles initial fetch. If profile missing (new Firebase user), 
  // checks for existing orphan profiles (by email/phone) before creating new.
  // =================================================================
  getMe: protectedProcedure.query(async ({ ctx }) => {
    try {
      const { uid, email, phone_number } = ctx.user;

      // A. Try to find the profile by current Auth ID
      let profile = await ctx.prisma.profile.findUnique({
        where: { userId: uid },
        include: { badges: true }
      });

      // B. Orphan Check: If not found, check if this email/phone exists under a different ID
      if (!profile) {
        const orConditions: any[] = [];
        if (email) orConditions.push({ email });
        if (phone_number) orConditions.push({ phoneNumber: phone_number });

        if (orConditions.length > 0) {
          const orphanProfile = await ctx.prisma.profile.findFirst({
            where: { OR: orConditions }
          });

          if (orphanProfile) {
            // Found an orphan! Relink it to the new UID
            console.log(`🔗 Relinking orphan profile ${orphanProfile.username} to new UID: ${uid}`);
            profile = await ctx.prisma.profile.update({
              where: { id: orphanProfile.id },
              data: { userId: uid },
              include: { badges: true }
            });
          }
        }
      }

      // C. If still no profile, Create New (Onboarding)
      if (!profile) {
        profile = await ctx.prisma.profile.create({
          data: {
            userId: uid,
            email: email || undefined,
            phoneNumber: phone_number || undefined,
            username: email?.split('@')[0] || `User_${uid.substring(0, 6)}`,
            leanExposure: { Left: 33, Center: 34, Right: 33 }, // Default neutral start
            topicInterest: {},
            notificationsEnabled: true,
            badges: [] // Initialize empty
          },
          include: { badges: true }
        });
        console.log(`✨ New Profile Created: ${profile.username}`);
      }

      return { profile };
    } catch (error) {
      console.error("Profile Fetch Error:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch profile" });
    }
  }),

  // =================================================================
  // 2. UPDATE PROFILE (Onboarding / Settings)
  // Includes Username Uniqueness Check
  // =================================================================
  updateProfile: protectedProcedure
    .input(z.object({
      username: z.string().min(3).optional(),
      notificationsEnabled: z.boolean().optional(),
      fcmToken: z.string().optional(), // For Push Notifications
    }))
    .mutation(async ({ ctx, input }) => {
      const updates: any = { ...input };

      // Username Uniqueness Check
      if (input.username) {
        const cleanUsername = input.username.trim();
        const existing = await ctx.prisma.profile.findUnique({
          where: { username: cleanUsername }
        });

        // If taken by someone else
        if (existing && existing.userId !== ctx.user.uid) {
          throw new TRPCError({ 
            code: "CONFLICT", 
            message: "Username already taken by another user." 
          });
        }
        updates.username = cleanUsername;
      }

      return await ctx.prisma.profile.update({
        where: { userId: ctx.user.uid },
        data: updates
      });
    }),

  // =================================================================
  // 3. SYNC ACTIVITY & UPDATE STATS (The "Heartbeat")
  // Called when user reads an article. Updates lean scores + checks badges.
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
          userId: ctx.user.uid,
          articleId,
          action: action as any, 
          timestamp: new Date()
        }
      });

      // 2. Fetch Article Metadata
      const article = await ctx.prisma.article.findUnique({
        where: { id: articleId },
        select: { politicalLean: true, category: true }
      });

      if (!article) return { success: true };

      // 3. Update User Personalization Stats (The Bubble)
      if (action === "read_full" || action === "share" || (action === "view" && timeSpent > 10)) {
        await userService.updateUserStats(ctx.user.uid, article);
      }

      // 4. Check Gamification (Badges/Streaks)
      const newBadges = await gamificationService.checkAchievements(ctx.user.uid);

      return { 
        success: true, 
        newBadges: newBadges.length > 0 ? newBadges : undefined 
      };
    }),

  // =================================================================
  // 4. GET USER STATS (Dashboard Charts)
  // Uses RAW MongoDB Aggregation to replicate exact original charts.
  // =================================================================
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.uid;

    try {
      // Execute Raw MongoDB Pipeline (Exact port from old backend)
      // Note: 'activitylogs' is the collection name mapped in schema.prisma
      const rawStats = await ctx.prisma.$runCommandRaw({
        aggregate: "activitylogs",
        pipeline: [
          { $match: { userId: userId } },
          { 
            $facet: {
              dailyCounts: [
                { $match: { 'action': 'view_analysis' } },
                {
                  $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                    count: { $sum: 1 }
                  }
                },
                { $sort: { _id: 1 } },
                { $limit: 30 }, 
                { $project: { _id: 0, date: '$_id', count: 1 } }
              ],
              leanDistribution_read: [
                { $match: { 'action': 'view_analysis' } },
                { $lookup: { from: 'articles', localField: 'articleId', foreignField: '_id', as: 'articleDetails' } },
                { $unwind: '$articleDetails' },
                { $group: { _id: '$articleDetails.politicalLean', count: { $sum: 1 } } },
                { $project: { _id: 0, lean: '$_id', count: 1 } }
              ],
              categoryDistribution_read: [
                { $match: { 'action': 'view_analysis' } },
                { $lookup: { from: 'articles', localField: 'articleId', foreignField: '_id', as: 'articleDetails' } },
                { $unwind: '$articleDetails' },
                { $group: { _id: '$articleDetails.category', count: { $sum: 1 } } },
                { $project: { _id: 0, category: '$_id', count: 1 } }
              ],
              qualityDistribution_read: [
                { $match: { 'action': 'view_analysis' } },
                { $lookup: { from: 'articles', localField: 'articleId', foreignField: '_id', as: 'articleDetails' } },
                { $unwind: '$articleDetails' },
                { $group: { _id: '$articleDetails.credibilityGrade', count: { $sum: 1 } } },
                { $project: { _id: 0, grade: '$_id', count: 1 } }
              ],
              totalCounts: [
                { $group: { _id: '$action', count: { $sum: 1 } } },
                { $project: { _id: 0, action: '$_id', count: 1 } }
              ],
            }
          }
        ],
        cursor: {} 
      }) as any;

      // Extract the first result from the cursor batch
      const statsBlock = rawStats.cursor?.firstBatch?.[0] || {};

      // Also fetch the Profile for the "Bubble Data" (Realtime stats)
      const profile = await ctx.prisma.profile.findUnique({
        where: { userId },
        select: { leanExposure: true, currentStreak: true }
      });

      return {
        // Legacy Chart Data
        timeframeDays: 'All Time',
        dailyCounts: statsBlock.dailyCounts || [],
        leanDistribution_read: statsBlock.leanDistribution_read || [],
        categoryDistribution_read: statsBlock.categoryDistribution_read || [],
        qualityDistribution_read: statsBlock.qualityDistribution_read || [],
        totalCounts: statsBlock.totalCounts || [],
        
        // New Realtime Data
        bubbleData: profile?.leanExposure,
        streak: profile?.currentStreak
      };

    } catch (e) {
      console.error("Stats Aggregation Error:", e);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to generate stats" });
    }
  }),

  // =================================================================
  // 5. DELETE ACCOUNT (Danger Zone)
  // Permanently removes User from DB + Firebase
  // =================================================================
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.uid;
    console.log(`🗑️ Deleting account for: ${userId}`);

    try {
      // 1. Database Cleanup (Transaction)
      await ctx.prisma.$transaction([
        ctx.prisma.profile.delete({ where: { userId } }),
        ctx.prisma.activityLog.deleteMany({ where: { userId } }),
        // Optional: Delete userStats if it exists
        ctx.prisma.userStats.deleteMany({ where: { userId } }) 
      ]);

      // 2. Firebase Auth Cleanup
      await firebaseAdmin.auth().deleteUser(userId);

      return { success: true, message: "Account permanently deleted" };
    } catch (error) {
      console.error("Delete Account Error:", error);
      throw new TRPCError({ 
        code: "INTERNAL_SERVER_ERROR", 
        message: "Failed to delete account completely. Please contact support." 
      });
    }
  })
});
