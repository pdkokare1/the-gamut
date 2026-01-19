// apps/api/src/services/user-service.ts
import { prisma } from '@gamut/db';
import { gamificationService } from './gamification';
import { TRPCError } from '@trpc/server';

export const userService = {

  // 1. GET OR CREATE PROFILE
  async ensureProfile(userId: string, email: string) {
    let profile = await prisma.profile.findUnique({
      where: { userId },
      include: { stats: true }
    });

    if (!profile) {
      profile = await prisma.profile.create({
        data: {
          userId,
          email,
          username: email.split('@')[0],
          stats: {
             create: {
                 leanExposure: { Left: 0, Center: 0, Right: 0 },
                 trustAverage: 0,
                 echoChamberScore: 0,
                 articlesRead: 0
             }
          }
        },
        include: { stats: true }
      });
    }
    return profile;
  },

  // 2. TRACK ARTICLE READ (Core "Brain" Logic)
  // This updates bias stats and triggers gamification
  async trackRead(userId: string, articleId: string) {
      const article = await prisma.article.findUnique({ where: { id: articleId } });
      if (!article) throw new TRPCError({ code: "NOT_FOUND" });

      const stats = await prisma.userStats.findUnique({ where: { userId } });
      if (!stats) return;

      // A. Update Lean Counts
      const currentLean = (stats.leanExposure as any) || { Left: 0, Center: 0, Right: 0 };
      
      // Map article lean to stats keys
      let leanKey = 'Center';
      if (article.politicalLean?.includes('Left')) leanKey = 'Left';
      else if (article.politicalLean?.includes('Right')) leanKey = 'Right';

      currentLean[leanKey] = (currentLean[leanKey] || 0) + 1;

      // B. Recalculate Echo Chamber Score
      const total = currentLean.Left + currentLean.Right + currentLean.Center;
      let echoScore = 0;
      
      if (total > 0) {
          const maxSide = Math.max(currentLean.Left, currentLean.Right);
          // Simple formula: % of reads that are from one side
          const biasRatio = maxSide / total; 
          echoScore = Math.round(biasRatio * 100);
          
          // Deduct for Center/Balanced reads
          if (currentLean.Center > 0) {
              echoScore -= Math.round((currentLean.Center / total) * 20);
          }
      }

      // C. Update Database
      await prisma.userStats.update({
          where: { userId },
          data: {
              articlesRead: { increment: 1 },
              leanExposure: currentLean,
              echoChamberScore: Math.max(0, Math.min(100, echoScore)), // Clamp 0-100
              lastActive: new Date()
          }
      });

      // D. Award XP (10xp per read)
      await gamificationService.awardXP(userId, 10, 'READ_ARTICLE');

      // E. Check Badges
      await gamificationService.checkBadges(userId, 'READ', { 
          readTime: 5, // Placeholder, ideally calculated from article.wordCount
          lean: leanKey 
      });

      return { success: true };
  },

  // 3. GET USER STATS (For Charts)
  async getUserStats(userId: string) {
      const stats = await prisma.userStats.findUnique({ where: { userId } });
      return stats;
  }
};
