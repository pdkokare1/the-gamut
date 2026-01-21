import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { prisma } from '@gamut/db';
import * as admin from 'firebase-admin';

// Reusable Stats Pipeline (Exact mirror of your Mongoose Aggregation)
const STATS_PIPELINE = (userId: string) => [
    { "$match": { "userId": userId } },
    { 
      "$facet": {
        "dailyCounts": [
          { "$match": { "action": "view_analysis" } },
          {
            "$group": {
              "_id": { "$dateToString": { "format": "%Y-%m-%d", "date": "$timestamp" } },
              "count": { "$sum": 1 }
            }
          },
          { "$sort": { "_id": 1 } },
          { "$limit": 30 }, 
          { "$project": { "_id": 0, "date": "$_id", "count": 1 } }
        ],
        "leanDistribution_read": [
          { "$match": { "action": "view_analysis" } },
          // Note: In Prisma/Mongo mapping, relations are foreign keys. 
          // We assume 'articles' collection uses standard _id linkage
          { "$lookup": { "from": "articles", "localField": "articleId", "foreignField": "_id", "as": "articleDetails" } },
          { "$unwind": "$articleDetails" },
          { "$group": { "_id": "$articleDetails.politicalLean", "count": { "$sum": 1 } } },
          { "$project": { "_id": 0, "lean": "$_id", "count": 1 } }
        ],
        "categoryDistribution_read": [
          { "$match": { "action": "view_analysis" } },
          { "$lookup": { "from": "articles", "localField": "articleId", "foreignField": "_id", "as": "articleDetails" } },
          { "$unwind": "$articleDetails" },
          { "$group": { "_id": "$articleDetails.category", "count": { "$sum": 1 } } },
          { "$project": { "_id": 0, "category": "$_id", "count": 1 } }
        ],
        "qualityDistribution_read": [
          { "$match": { "action": "view_analysis" } },
          { "$lookup": { "from": "articles", "localField": "articleId", "foreignField": "_id", "as": "articleDetails" } },
          { "$unwind": "$articleDetails" },
          { "$group": { "_id": "$articleDetails.credibilityGrade", "count": { "$sum": 1 } } },
          { "$project": { "_id": 0, "grade": "$_id", "count": 1 } }
        ],
        "totalCounts": [
          { "$group": { "_id": "$action", "count": { "$sum": 1 } } },
          { "$project": { "_id": 0, "action": "$_id", "count": 1 } }
        ],
      }
    }
];

export const profileRouter = router({
  
  // --- 1. GET MY PROFILE ---
  me: protectedProcedure.query(async ({ ctx }) => {
    const profile = await prisma.profile.findUnique({
      where: { userId: ctx.user.uid },
      select: {
          username: true,
          email: true,
          phoneNumber: true,
          articlesViewedCount: true,
          comparisonsViewedCount: true,
          articlesSharedCount: true,
          notificationsEnabled: true,
          currentStreak: true,
          badges: true,
          // Relation handling for Saved Articles count
          _count: {
              select: { savedArticles: true }
          }
      }
    });

    if (!profile) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });
    }
    
    return profile;
  }),

  // --- 2. CREATE / LINK PROFILE ---
  create: protectedProcedure
    .input(z.object({ username: z.string().min(3) }))
    .mutation(async ({ input, ctx }) => {
        const { uid, email, phone_number } = ctx.user;
        const cleanUsername = input.username.trim();

        // A. Username Availability Check
        const usernameOwner = await prisma.profile.findUnique({
            where: { username: cleanUsername }
        });

        if (usernameOwner) {
            const isSelf = (email && usernameOwner.email === email) || 
                           (phone_number && usernameOwner.phoneNumber === phone_number);
            
            if (!isSelf && usernameOwner.userId !== uid) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Username already taken' });
            }
        }

        // B. Orphan Check (Recover accounts where Firebase UID changed)
        // Prisma doesn't support $or across unique fields easily in findUnique, use findFirst
        const existingProfile = await prisma.profile.findFirst({
            where: {
                OR: [
                    email ? { email } : {},
                    phone_number ? { phoneNumber: phone_number } : {}
                ]
            }
        });

        if (existingProfile) {
            if (existingProfile.userId !== uid) {
                // Relink logic
                await prisma.profile.update({
                    where: { id: existingProfile.id },
                    data: { userId: uid }
                });
                console.log(`🔗 Relinked orphan profile for ${email || phone_number}`);
            }
            return existingProfile;
        }

        // C. Create New
        return await prisma.profile.create({
            data: {
                userId: uid,
                email: email || null,
                phoneNumber: phone_number || null,
                username: cleanUsername,
                notificationsEnabled: true,
                badges: []
            }
        });
    }),

  // --- 3. UPDATE PROFILE ---
  update: protectedProcedure
    .input(z.object({
        username: z.string().min(3).optional(),
        notificationsEnabled: z.boolean().optional()
    }))
    .mutation(async ({ input, ctx }) => {
        const updates: any = {};

        if (input.username) {
            const clean = input.username.trim();
            const owner = await prisma.profile.findUnique({ where: { username: clean }});
            if (owner && owner.userId !== ctx.user.uid) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Username taken' });
            }
            updates.username = clean;
        }

        if (input.notificationsEnabled !== undefined) {
            updates.notificationsEnabled = input.notificationsEnabled;
        }

        return await prisma.profile.update({
            where: { userId: ctx.user.uid },
            data: updates
        });
    }),

  // --- 4. SAVE PUSH TOKEN ---
  savePushToken: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
        await prisma.profile.update({
            where: { userId: ctx.user.uid },
            data: { fcmToken: input.token, notificationsEnabled: true }
        });
        return { success: true };
    }),

  // --- 5. GET STATS (Raw Aggregation) ---
  getStats: protectedProcedure.query(async ({ ctx }) => {
      // Execute raw pipeline on the "activitylogs" collection
      const rawResult = await prisma.$runCommandRaw({
          aggregate: "activitylogs",
          pipeline: STATS_PIPELINE(ctx.user.uid),
          cursor: {} 
      }) as any;

      // Parsing Raw Mongo Response
      const stats = rawResult?.cursor?.firstBatch?.[0] || {};

      return {
          timeframeDays: 'All Time',
          dailyCounts: stats.dailyCounts || [],
          leanDistribution_read: stats.leanDistribution_read || [],
          categoryDistribution_read: stats.categoryDistribution_read || [],
          qualityDistribution_read: stats.qualityDistribution_read || [],
          totalCounts: stats.totalCounts || [],
      };
  }),

  // --- 6. DELETE ACCOUNT ---
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
      const uid = ctx.user.uid;
      
      // 1. DB Delete
      await prisma.profile.deleteMany({ where: { userId: uid } });
      await prisma.activityLog.deleteMany({ where: { userId: uid } });
      await prisma.userStats.deleteMany({ where: { userId: uid } });

      // 2. Firebase Delete
      try {
          await admin.auth().deleteUser(uid);
      } catch (e) {
          console.warn("Firebase user delete failed or already gone.");
      }

      return { success: true };
  })
});
