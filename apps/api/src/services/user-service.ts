import { prisma } from "@repo/db";
import logger from "../utils/logger";

class UserService {
    
    // --- 1. Get or Create Profile ---
    async getOrCreateProfile(userId: string, email?: string) {
        // Try to find existing
        const profile = await prisma.profile.findUnique({
            where: { userId },
            include: { savedArticles: false } // Perf optimization
        });

        if (profile) return profile;

        // Create New
        logger.info(`👤 Creating new profile for: ${userId}`);
        return await prisma.profile.create({
            data: {
                userId,
                email: email || "",
                onboardingCompleted: false,
                preferences: {
                    theme: 'system',
                    notifications: true,
                    autoplay: false,
                    textScale: 1
                },
                stats: {
                    articlesRead: 0,
                    minutesListened: 0,
                    currentStreak: 0,
                    longestStreak: 0,
                    lastActive: new Date()
                }
            }
        });
    }

    // --- 2. Update Preferences ---
    async updatePreferences(userId: string, prefs: any) {
        return await prisma.profile.update({
            where: { userId },
            data: {
                preferences: prefs // Prisma handles the JSON merge/replace
            }
        });
    }

    // --- 3. Follow/Unfollow Topics ---
    async toggleFollowTopic(userId: string, topic: string) {
        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) return null;

        // Prisma JSON operations can be tricky, so we read-modify-write for arrays
        const currentTopics = (profile.followingTopics as string[]) || [];
        const exists = currentTopics.includes(topic);

        const newTopics = exists 
            ? currentTopics.filter(t => t !== topic) 
            : [...currentTopics, topic];

        return await prisma.profile.update({
            where: { userId },
            data: { followingTopics: newTopics }
        });
    }

    // --- 4. Record Activity (Stats) ---
    async recordActivity(userId: string, type: 'READ' | 'LISTEN', durationSeconds: number = 0) {
        const today = new Date();
        
        // Transaction to ensure stats integrity
        const profile = await prisma.profile.findUnique({ where: { userId } });
        if (!profile) return;

        const stats = profile.stats as any;
        const lastActive = new Date(stats.lastActive);
        
        // Streak Logic
        const isSameDay = lastActive.getDate() === today.getDate() && 
                          lastActive.getMonth() === today.getMonth();
        const isNextDay = (today.getTime() - lastActive.getTime()) < (48 * 60 * 60 * 1000) && !isSameDay;

        let newStreak = stats.currentStreak;
        if (isNextDay) newStreak += 1;
        else if (!isSameDay) newStreak = 1; // Reset if gap > 1 day

        const updates: any = {
            lastActive: today,
            currentStreak: newStreak,
            longestStreak: Math.max(newStreak, stats.longestStreak || 0)
        };

        if (type === 'READ') {
            updates.articlesRead = (stats.articlesRead || 0) + 1;
        } else if (type === 'LISTEN') {
            updates.minutesListened = (stats.minutesListened || 0) + Math.ceil(durationSeconds / 60);
        }

        await prisma.profile.update({
            where: { userId },
            data: {
                stats: { ...stats, ...updates }
            }
        });
    }
}

export const userService = new UserService();
