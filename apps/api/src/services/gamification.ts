import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const gamificationService = {
  // --- 1. Streak Logic ---
  async updateStreak(userId: string) {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { id: true, lastActiveDate: true, currentStreak: true, username: true }
    });

    if (!profile) return null;

    const now = new Date();
    const lastActive = profile.lastActiveDate ? new Date(profile.lastActiveDate) : new Date(0);

    // Normalize to midnight to compare "days"
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const lastDate = new Date(lastActive.getFullYear(), lastActive.getMonth(), lastActive.getDate()).getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    let newStreak = profile.currentStreak;

    // A. Same day? Do nothing.
    if (today === lastDate) {
      return { streak: newStreak, updated: false };
    }

    // B. Consecutive day? Increment.
    if (today - lastDate === oneDay) {
      newStreak += 1;
      console.log(`🔥 Streak Incremented for ${profile.username}: ${newStreak}`);
    } 
    // C. Missed a day? Reset.
    else {
      // Only reset if it's not the very first activity
      if (profile.lastActiveDate) {
        newStreak = 1;
        console.log(`❄️ Streak Reset for ${profile.username}`);
      } else {
        newStreak = 1; // First ever action
      }
    }

    // Update Profile
    await prisma.profile.update({
      where: { userId },
      data: {
        lastActiveDate: now,
        currentStreak: newStreak
      }
    });

    // Check for new badges immediately
    await this.checkStreakBadges(userId, newStreak);

    return { streak: newStreak, updated: true };
  },

  // --- 2. Check Streak Badges ---
  async checkStreakBadges(userId: string, currentStreak: number) {
    const streakBadges = [
      { id: 'streak_3', label: '3 Day Streak', threshold: 3, icon: '🔥', description: 'Maintained a 3 day reading streak.' },
      { id: 'streak_7', label: 'Week Warrior', threshold: 7, icon: '⚔️', description: 'Maintained a 7 day reading streak.' },
      { id: 'streak_30', label: 'Monthly Master', threshold: 30, icon: '👑', description: 'Maintained a 30 day reading streak.' }
    ];

    // Get current badges
    const profile = await prisma.profile.findUnique({
        where: { userId },
        select: { badges: true }
    });
    
    if (!profile) return;

    // Use a Set for O(1) lookups of existing badge IDs
    // Assuming 'badges' is stored as a JSON array of objects in Prisma
    const existingBadgeIds = new Set((profile.badges as any[]).map((b: any) => b.id));

    const newBadges = [];

    for (const badge of streakBadges) {
      if (currentStreak >= badge.threshold && !existingBadgeIds.has(badge.id)) {
        newBadges.push({
          id: badge.id,
          label: badge.label,
          icon: badge.icon,
          description: badge.description,
          earnedAt: new Date().toISOString()
        });
        console.log(`🏆 Badge Awarded: ${badge.label}`);
      }
    }

    if (newBadges.length > 0) {
      // Push new badges to the JSON array
      await prisma.profile.update({
        where: { userId },
        data: {
          badges: {
            push: newBadges
          }
        }
      });
    }
  },

  // --- 3. Check Read Count Badges ---
  async checkReadBadges(userId: string) {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { articlesViewedCount: true, badges: true }
    });

    if (!profile) return;

    const count = profile.articlesViewedCount;
    const viewBadges = [
      { id: 'reader_10', label: 'Informed', threshold: 10, icon: '📰', description: 'Read 10 articles.' },
      { id: 'reader_50', label: 'Well Read', threshold: 50, icon: '📚', description: 'Read 50 articles.' },
      { id: 'reader_100', label: 'News Junkie', threshold: 100, icon: '🧠', description: 'Read 100 articles.' }
    ];

    const existingBadgeIds = new Set((profile.badges as any[]).map((b: any) => b.id));
    const newBadges = [];

    for (const badge of viewBadges) {
      if (count >= badge.threshold && !existingBadgeIds.has(badge.id)) {
        newBadges.push({
          id: badge.id,
          label: badge.label,
          icon: badge.icon,
          description: badge.description,
          earnedAt: new Date().toISOString()
        });
      }
    }

    if (newBadges.length > 0) {
      await prisma.profile.update({
        where: { userId },
        data: {
          badges: {
            push: newBadges
          }
        }
      });
    }
  }
};
