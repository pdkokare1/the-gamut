// apps/api/src/services/gamification.ts
import { prisma } from '@gamut/db';
import logger from '../utils/logger';

// Badge Definitions
const BADGES = {
  NEWCOMER: { id: 'newcomer', label: 'First Step', description: 'Read your first article', icon: '🌱' },
  AVID_READER: { id: 'avid_reader', label: 'Avid Reader', description: 'Read 50 articles', icon: '📚' },
  NEWS_JUNKIE: { id: 'news_junkie', label: 'News Junkie', description: 'Read 100 articles', icon: '⚡' },
  CONSECUTIVE_WEEK: { id: 'week_streak', label: '7 Day Streak', description: 'Visited 7 days in a row', icon: '🔥' },
  SCHOLAR: { id: 'scholar', label: 'Scholar', description: 'Read articles from 5 different categories', icon: '🎓' },
  PIONEER: { id: 'pioneer', label: 'Early Adopter', description: 'Joined during the beta', icon: '🚀' }
};

class GamificationService {
  
  /**
   * Updates user streak and checks for daily rewards.
   * Call this whenever a user logs in or reads an article.
   */
  async updateStreak(userId: string) {
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) return;

    const now = new Date();
    const lastActive = new Date(profile.lastActiveDate);
    
    // Check if same day (UTC)
    const isSameDay = now.toISOString().split('T')[0] === lastActive.toISOString().split('T')[0];
    if (isSameDay) return; // Already updated today

    // Check if yesterday (Consecutive)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isConsecutive = yesterday.toISOString().split('T')[0] === lastActive.toISOString().split('T')[0];

    let newStreak = isConsecutive ? profile.currentStreak + 1 : 1;

    // Update DB
    await prisma.profile.update({
      where: { userId },
      data: {
        currentStreak: newStreak,
        lastActiveDate: now
      }
    });

    // Check Streak Badge
    if (newStreak >= 7) {
      await this.awardBadge(userId, BADGES.CONSECUTIVE_WEEK);
    }
  }

  /**
   * Tracks an action (View, Share) and awards XP/Badges.
   */
  async trackAction(userId: string, action: 'VIEW' | 'SHARE') {
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) return;

    // 1. Increment Stats
    const updateData: any = {};
    if (action === 'VIEW') updateData.articlesViewedCount = { increment: 1 };
    if (action === 'SHARE') updateData.articlesSharedCount = { increment: 1 };

    const updatedProfile = await prisma.profile.update({
      where: { userId },
      data: updateData
    });

    // 2. Check Badges
    if (updatedProfile.articlesViewedCount === 1) await this.awardBadge(userId, BADGES.NEWCOMER);
    if (updatedProfile.articlesViewedCount === 50) await this.awardBadge(userId, BADGES.AVID_READER);
    if (updatedProfile.articlesViewedCount === 100) await this.awardBadge(userId, BADGES.NEWS_JUNKIE);
  }

  /**
   * Awards a badge if the user doesn't have it yet.
   */
  private async awardBadge(userId: string, badgeDef: typeof BADGES[keyof typeof BADGES]) {
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) return;

    // Check if already owned
    const hasBadge = profile.badges.some((b: any) => b.id === badgeDef.id);
    if (hasBadge) return;

    logger.info(`🏆 Awarding Badge [${badgeDef.label}] to user ${userId}`);

    await prisma.profile.update({
      where: { userId },
      data: {
        badges: {
          push: {
            id: badgeDef.id,
            label: badgeDef.label,
            icon: badgeDef.icon,
            description: badgeDef.description,
            earnedAt: new Date()
          }
        }
      }
    });
  }
}

export const gamificationService = new GamificationService();
