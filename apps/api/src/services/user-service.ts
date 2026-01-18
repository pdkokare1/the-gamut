// apps/api/src/services/user-service.ts
import { prisma } from "../utils/prisma";

export const userService = {
  /**
   * Updates the user's "Lean Exposure" (Political Bubble)
   * This logic ensures the profile constantly reflects their reading habits.
   */
  async updateUserStats(userId: string, article: { politicalLean: string, category: string }) {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { leanExposure: true, topicInterest: true, articlesViewedCount: true }
    });

    if (!profile) return;

    // 1. Calculate New Lean Exposure
    // We use a weighted average: Old State (95%) + New Article (5%)
    // This prevents one article from skewing the stats too wildly.
    const currentLean = (profile.leanExposure as any) || { Left: 0, Center: 0, Right: 0 };
    
    // Increment the counter for the specific lean
    const leanKey = article.politicalLean; // "Left", "Right", or "Center"
    
    // Simple Increment Logic (for display counts)
    if (currentLean[leanKey] !== undefined) {
      currentLean[leanKey] += 1;
    } else {
        currentLean[leanKey] = 1;
    }

    // 2. Update Topic Interests (e.g., { "Tech": 5, "Politics": 10 })
    const currentTopics = (profile.topicInterest as any) || {};
    if (currentTopics[article.category]) {
      currentTopics[article.category] += 1;
    } else {
      currentTopics[article.category] = 1;
    }

    // 3. Save Updates
    await prisma.profile.update({
      where: { userId },
      data: {
        articlesViewedCount: { increment: 1 },
        leanExposure: currentLean,
        topicInterest: currentTopics,
        lastActiveDate: new Date()
      }
    });
  }
};
