import { prisma } from '@gamut/db';

export const gamificationService = {
  /**
   * Checks a user's activity and awards new badges if criteria are met.
   */
  async checkAndAwardBadges(userId: string) {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: { savedArticles: true }
    });

    if (!profile) return;

    const newBadges: { id: string; label: string; icon: string; description: string }[] = [];
    const currentBadgeIds = new Set(profile.badges.map(b => b.id));

    // --- Badge Logic Definitions ---

    // 1. The Reader (First Article)
    if (profile.articlesViewedCount >= 1 && !currentBadgeIds.has('reader_1')) {
      newBadges.push({
        id: 'reader_1',
        label: 'First Step',
        icon: '📖',
        description: 'Read your first article.'
      });
    }

    // 2. Avid Reader (50 Articles)
    if (profile.articlesViewedCount >= 50 && !currentBadgeIds.has('reader_50')) {
      newBadges.push({
        id: 'reader_50',
        label: 'Well Read',
        icon: '📚',
        description: 'Read 50 articles.'
      });
    }

    // 3. Streak Master (3 Day Streak)
    if (profile.currentStreak >= 3 && !currentBadgeIds.has('streak_3')) {
      newBadges.push({
        id: 'streak_3',
        label: 'On a Roll',
        icon: '🔥',
        description: 'Maintained a 3-day reading streak.'
      });
    }

    // 4. Critical Thinker (Viewed Comparisons)
    if (profile.comparisonsViewedCount >= 5 && !currentBadgeIds.has('thinker_5')) {
      newBadges.push({
        id: 'thinker_5',
        label: 'Critical Thinker',
        icon: '🧠',
        description: 'Compared coverage on 5 different topics.'
      });
    }

    // 5. Curator (Saved 10 Articles)
    if (profile.savedArticles.length >= 10 && !currentBadgeIds.has('saver_10')) {
      newBadges.push({
        id: 'saver_10',
        label: 'Curator',
        icon: '🔖',
        description: 'Saved 10 articles for later.'
      });
    }

    // --- Update Database ---
    if (newBadges.length > 0) {
      console.log(`🏆 Awarding ${newBadges.length} badges to ${profile.username}`);
      await prisma.profile.update({
        where: { userId },
        data: {
          badges: {
            push: newBadges.map(b => ({ ...b, earnedAt: new Date() }))
          }
        }
      });
    }

    return newBadges;
  }
};
