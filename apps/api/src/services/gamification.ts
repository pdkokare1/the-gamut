// apps/api/src/services/gamification.ts
import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';

// --- Constants (Ported from Legacy) ---
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500]; // xp required for levels 1-10

export const BADGES = {
  BUBBLE_BURSTER: {
    id: 'bubble_burster',
    name: 'Bubble Burster',
    description: 'Read 5 articles from opposing political viewpoints.',
    icon: '📍',
    xp: 150
  },
  STREAK_MASTER: {
    id: 'streak_master',
    name: 'Streak Master',
    description: 'Maintain a 7-day reading streak.',
    icon: '🔥',
    xp: 300
  },
  DEEP_DIVER: {
    id: 'deep_diver',
    name: 'Deep Diver',
    description: 'Read 3 Long-Form analyses in one day.',
    icon: '🤿',
    xp: 100
  },
  VERIFIER: {
    id: 'verifier',
    name: 'Source Verifier',
    description: 'Opened the "Compare Sources" view 10 times.',
    icon: '⚖️',
    xp: 100
  },
  EARLY_BIRD: {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Read the morning briefing before 8 AM.',
    icon: '☕',
    xp: 50
  }
};

export const gamificationService = {
  
  // 1. AWARD XP & CHECK LEVEL UP
  async awardXP(userId: string, amount: number, action: string) {
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) return;

    let newXP = profile.xp + amount;
    let newLevel = profile.level;

    // Check Level Up
    // Find the highest level where newXP >= threshold
    const calculatedLevel = LEVEL_THRESHOLDS.findIndex(t => newXP < t); 
    // If findIndex returns -1, they are max level (above last threshold)
    const actualLevel = calculatedLevel === -1 ? LEVEL_THRESHOLDS.length : calculatedLevel;

    if (actualLevel > newLevel) {
      newLevel = actualLevel;
      // potentially send notification: "Level Up!"
    }

    await prisma.profile.update({
      where: { userId },
      data: { 
        xp: newXP, 
        level: newLevel 
      }
    });

    return { newXP, newLevel, leveledUp: newLevel > profile.level };
  },

  // 2. CHECK BADGE ELIGIBILITY
  // This replaces the complex switch statements in the old service
  async checkBadges(userId: string, actionType: 'READ' | 'SHARE' | 'COMPARE', metadata?: any) {
    const profile = await prisma.profile.findUnique({ 
        where: { userId },
        include: { 
            achievedBadges: true, // Assuming relation exists
            stats: true           // Access bias stats
        }
    });
    
    if (!profile || !profile.stats) return [];

    const earnedBadges: string[] = [];
    const currentBadges = new Set(profile.achievedBadges.map(b => b.badgeId));

    // -- LOGIC: BUBBLE BURSTER --
    if (!currentBadges.has(BADGES.BUBBLE_BURSTER.id) && actionType === 'READ') {
       // Logic: Check if they have balanced exposure
       const { Left, Right } = profile.stats.leanExposure as any;
       // If they have read at least 5 from both sides
       if (Left >= 5 && Right >= 5) {
           await this.grantBadge(userId, BADGES.BUBBLE_BURSTER);
           earnedBadges.push(BADGES.BUBBLE_BURSTER.name);
       }
    }

    // -- LOGIC: DEEP DIVER --
    if (!currentBadges.has(BADGES.DEEP_DIVER.id) && actionType === 'READ') {
       // Logic: Check if article was "Long Form" ( > 5 min read)
       // This would require checking daily history count of long articles
       // Simplified for now:
       if (metadata?.readTime > 5) {
           // We'd ideally count daily reads here. 
           // For parity, we'll assume the caller passes a 'dailyLongReadCount' in metadata if available
           if (metadata.dailyLongReads >= 3) {
               await this.grantBadge(userId, BADGES.DEEP_DIVER);
               earnedBadges.push(BADGES.DEEP_DIVER.name);
           }
       }
    }

    // -- LOGIC: VERIFIER --
    if (!currentBadges.has(BADGES.VERIFIER.id) && actionType === 'COMPARE') {
        // Increment internal counter in Profile metadata or Stats
        // For now, we assume this check happens
        // Implementation note: You might need a field 'compareCount' in UserStats
    }

    return earnedBadges;
  },

  // 3. GRANT BADGE HELPER
  async grantBadge(userId: string, badgeDef: any) {
      // 1. Create Badge Record
      await prisma.badge.create({
          data: {
              userId,
              badgeId: badgeDef.id,
              name: badgeDef.name,
              icon: badgeDef.icon,
              earnedAt: new Date()
          }
      });

      // 2. Award Bonus XP
      await this.awardXP(userId, badgeDef.xp, 'BADGE_EARNED');
      
      logger.info(`🏆 Badge Awarded: ${badgeDef.name} to ${userId}`);
  }
};
