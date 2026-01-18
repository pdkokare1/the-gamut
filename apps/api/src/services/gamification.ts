// apps/api/src/services/gamification.ts
import { prisma } from "../utils/prisma";

// Badge Definitions
const BADGES = {
  NEWCOMER: {
    id: "badge_newcomer",
    label: "Newcomer",
    icon: "👋",
    description: "Read your first article."
  },
  SCHOLAR: {
    id: "badge_scholar",
    label: "Scholar",
    icon: "🎓",
    description: "Read 100 articles."
  },
  BALANCED_READER: {
    id: "badge_balanced",
    label: "Balanced Reader",
    icon: "⚖️",
    description: "Maintained a balanced news diet (30%+ from all sides)."
  },
  STREAK_7: {
    id: "badge_streak_7",
    label: "Week Warrior",
    icon: "🔥",
    description: "7 Day reading streak."
  }
};

export const gamificationService = {
  /**
   * Checks all criteria and awards new badges if earned.
   * Returns an array of newly awarded badges to notify the user.
   */
  async checkAchievements(userId: string) {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: { badges: true } // See what they already have
    });

    if (!profile) return [];

    const existingBadgeIds = new Set(profile.badges.map(b => b.id));
    const newBadges: typeof BADGES[keyof typeof BADGES][] = [];

    // --- CHECK 1: View Counts ---
    if (profile.articlesViewedCount >= 1 && !existingBadgeIds.has(BADGES.NEWCOMER.id)) {
      newBadges.push(BADGES.NEWCOMER);
    }
    if (profile.articlesViewedCount >= 100 && !existingBadgeIds.has(BADGES.SCHOLAR.id)) {
      newBadges.push(BADGES.SCHOLAR);
    }

    // --- CHECK 2: Streaks ---
    // (Assuming updateStreak logic runs on login/daily access, checking here for badge)
    if (profile.currentStreak >= 7 && !existingBadgeIds.has(BADGES.STREAK_7.id)) {
      newBadges.push(BADGES.STREAK_7);
    }

    // --- CHECK 3: Balance (Anti-Echo Chamber) ---
    const exposure = profile.leanExposure as { Left: number, Center: number, Right: number };
    if (exposure) {
      const total = (exposure.Left || 0) + (exposure.Center || 0) + (exposure.Right || 0);
      if (total > 20) { // Only check after significant reading
        const pctLeft = (exposure.Left / total) * 100;
        const pctRight = (exposure.Right / total) * 100;
        const pctCenter = (exposure.Center / total) * 100;

        // Strict definition of "Balanced": No side is ignored (< 20%)
        if (pctLeft > 20 && pctRight > 20 && pctCenter > 20 && !existingBadgeIds.has(BADGES.BALANCED_READER.id)) {
          newBadges.push(BADGES.BALANCED_READER);
        }
      }
    }

    // --- Database Update ---
    if (newBadges.length > 0) {
      await prisma.profile.update({
        where: { userId },
        data: {
          badges: {
            push: newBadges.map(b => ({
              id: b.id,
              label: b.label,
              icon: b.icon,
              description: b.description,
              earnedAt: new Date()
            }))
          },
          // Increase engagement score for earning badges
          engagementScore: { increment: newBadges.length * 10 } 
        }
      });
    }

    return newBadges;
  }
};
