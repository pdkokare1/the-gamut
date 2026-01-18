// apps/api/src/services/gatekeeper.ts
import { prisma } from '@gamut/db';
import redisHelper from '../utils/redis';
import { logger } from '../utils/logger';

// --- CONSTANTS: Static Rules (Fallback) ---
const STATIC_BLOCKED_DOMAINS = [
    'globelive.com', 'biztoc.com', 'news-press.com', 
    'marketwatch.com', // Often paywalled
    'fool.com'        // Often opinion/clickbait
];

const SPAM_KEYWORDS = [
    'casino', 'gambling', 'viagra', 'cialis', 'crypto giveaway', 
    'sponsored content', 'partner content', 'advertisement'
];

const CLICKBAIT_PATTERNS = [
    /you won['’]t believe/i,
    /what happens next/i,
    /shocks the world/i,
    /expert says sell/i,
    /10 reasons why/i
];

class GatekeeperService {

    // =================================================================
    // 1. Config Loading (Redis + DB)
    // =================================================================
    /**
     * Fetches the latest rules from Cache or DB.
     * Use this to update blocked lists without redeploying.
     */
    private async getSystemRules() {
        return await redisHelper.getOrFetch('SYSTEM_GATEKEEPER_RULES', async () => {
            try {
                const config = await prisma.systemConfig.findFirst({
                    where: { key: 'main_config' }
                });
                return {
                    blockedDomains: config?.blockedDomains || STATIC_BLOCKED_DOMAINS,
                    spamKeywords: config?.spamKeywords || SPAM_KEYWORDS
                };
            } catch (error) {
                logger.warn('⚠️ Gatekeeper Config Load Failed (Using Defaults)');
                return { blockedDomains: STATIC_BLOCKED_DOMAINS, spamKeywords: SPAM_KEYWORDS };
            }
        }, 300); // Cache for 5 minutes
    }

    // =================================================================
    // 2. The Main Filter Function
    // =================================================================
    async filter(article: any): Promise<{ pass: boolean; reason?: string; score?: number }> {
        if (!article) return { pass: false, reason: 'Empty Data' };

        const { blockedDomains, spamKeywords } = await this.getSystemRules();

        // Check 1: Blocked Source/Domain
        if (this.isBlockedSource(article.source?.name, article.url, blockedDomains)) {
            return { pass: false, reason: 'Blocked Domain' };
        }

        // Check 2: Missing Critical Data
        if (!article.headline || article.headline.length < 10) {
            return { pass: false, reason: 'Headline too short' };
        }

        // Check 3: Spam Keywords (Headline)
        if (this.containsKeywords(article.headline, spamKeywords)) {
            return { pass: false, reason: 'Spam Keyword in Headline' };
        }

        // Check 4: Clickbait Detection
        if (this.isClickbait(article.headline)) {
            return { pass: false, reason: 'Detected Clickbait' };
        }

        // Check 5: Language (Basic Check)
        // If your scraper captures language, use it. Otherwise, assume English context for now.
        if (article.language && article.language !== 'en') {
            return { pass: false, reason: 'Non-English Content' };
        }

        return { pass: true, score: 100 };
    }

    // =================================================================
    // 3. Helper Logic
    // =================================================================

    private isBlockedSource(sourceName: string, url: string, blockedList: string[]): boolean {
        const target = (sourceName || '').toLowerCase();
        const targetUrl = (url || '').toLowerCase();

        return blockedList.some(domain => {
            const cleanDomain = domain.toLowerCase().trim();
            return target.includes(cleanDomain) || targetUrl.includes(cleanDomain);
        });
    }

    private containsKeywords(text: string, keywords: string[]): boolean {
        const lowerText = text.toLowerCase();
        return keywords.some(kw => lowerText.includes(kw.toLowerCase()));
    }

    private isClickbait(headline: string): boolean {
        return CLICKBAIT_PATTERNS.some(pattern => pattern.test(headline));
    }
}

export default new GatekeeperService();
