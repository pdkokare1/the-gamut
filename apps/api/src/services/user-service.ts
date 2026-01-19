// apps/api/src/services/user-service.ts
import { prisma } from '@gamut/db';
import { gamificationService } from './gamification';
import { TRPCError } from '@trpc/server';

export const userService = {

  // 1. GET OR CREATE PROFILE
  async ensureProfile(userId: string, email: string) {
    let profile = await prisma.profile.findUnique({
      where: { userId },
      include: { userStats: true } // Correct relation name from schema
    });

    if (!profile) {
      profile = await prisma.profile.create({
        data: {
          userId,
          email,
          username: email.split('@')[0],
          userStats: {
             create: {
                 leanExposure: { Left: 0, Center: 0, Right: 0 },
                 engagementScore: 50
             }
          }
        },
        include: { userStats: true }
      });
    }
    return profile;
  },

  // 2. TRACK ARTICLE READ (Core "Brain" Logic)
  // Renamed to updateUserStats to match Router call
  async updateUserStats(userId: string, article: { politicalLean: string, category: string }) {
      
      const stats = await prisma.userStats.findUnique({ where: { userId } });
      if (!stats) return;

      // A. Update Lean Counts
      const currentLean = (stats.leanExposure as any) || { Left: 0, Center: 0, Right: 0 };
      
      let leanKey = 'Center';
      // Normalize lean string from DB
      const leanLower = article.politicalLean?.toLowerCase() || '';
      if (leanLower.includes('left')) leanKey = 'Left';
      else if (leanLower.includes('right')) leanKey = 'Right';

      currentLean[leanKey] = (currentLean[leanKey] || 0) + 1;

      // B. Recalculate Echo Chamber Score
      const total = currentLean.Left + currentLean.Right + currentLean.Center;
      let echoScore = 0;
      
      if (total > 0) {
          const maxSide = Math.max(currentLean.Left, currentLean.Right);
          // Simple formula: % of reads that are from one side
          const biasRatio = maxSide / total; 
          echoScore = Math.round(biasRatio * 100);
          
          // Deduct for Center/Balanced reads (Reward balance)
          if (currentLean.Center > 0) {
              echoScore -= Math.round((currentLean.Center / total) * 20);
          }
      }

      // C. Update Database
      await prisma.userStats.update({
          where: { userId },
          data: {
              leanExposure: currentLean,
              // Map echo score to engagementScore or track separately if schema allows
              // For now, assuming engagementScore is a proxy or we add echoScore to schema
              engagementScore: Math.max(0, Math.min(100, echoScore)), 
              lastUpdated: new Date()
          }
      });

      // D. Award XP (10xp per read)
      // Note: Ensure gamificationService is fully ported
      try {
        await gamificationService.awardXP(userId, 10, 'READ_ARTICLE');
        await gamificationService.checkBadges(userId, 'READ', { 
             readTime: 5, 
             lean: leanKey 
        });
      } catch (e) {
          console.warn("Gamification error (non-fatal):", e);
      }

      return { success: true };
  },

  // 3. GET USER STATS (For Charts)
  async getUserStats(userId: string) {
      const stats = await prisma.userStats.findUnique({ where: { userId } });
      return stats;
  }
};
