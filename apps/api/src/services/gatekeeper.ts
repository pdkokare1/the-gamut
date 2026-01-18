import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';

class GatekeeperService {
    // Hardcoded Blacklist (Immediate Rejection)
    private BLACKLISTED_DOMAINS = [
        'globenewswire.com', 'prnewswire.com', 'businesswire.com', // Press Releases
        'marketwatch.com', 'fool.com', 'investors.com',           // Financial Noise
        'youtube.com', 'vimeo.com',                               // Video Platforms
        'twitter.com', 'x.com', 'facebook.com', 'instagram.com',  // Social Media
        'tiktok.com', 'pinterest.com',
        'ebay.com', 'amazon.com', 'craigslist.org',               // E-commerce
        'sports.yahoo.com', 'espn.com',                           // Pure Sports
        'entertainment.yahoo.com', 'tmz.com'                      // Pure Tabloid
    ];

    private PAYWALL_INDICATORS = [
        'subscribe', 'subscription', 'paywall', 'register to read', 
        'subscriber-only', 'premium content'
    ];

    /**
     * STAGE 1: Fast URL Check (Pre-Fetch)
     */
    public isAllowedSource(url: string, sourceName: string): boolean {
        if (!url) return false;
        const lowerUrl = url.toLowerCase();
        const lowerSource = sourceName.toLowerCase();

        // 1. Check Domain Blacklist
        if (this.BLACKLISTED_DOMAINS.some(domain => lowerUrl.includes(domain))) {
            return false;
        }

        // 2. Check Source Name Blacklist (Aggregators)
        if (lowerSource.includes('pr newswire') || lowerSource.includes('globe newswire')) {
            return false;
        }

        return true;
    }

    /**
     * STAGE 2: Content Validation (Post-Fetch)
     */
    public async validateContent(text: string): Promise<boolean> {
        if (!text) return false;
        
        // 1. Length Check
        if (text.length < 200) return false; // Too short to be news

        // 2. Paywall Check
        const lowerText = text.toLowerCase().slice(0, 500); // Check header only
        const isPaywalled = this.PAYWALL_INDICATORS.some(ind => lowerText.includes(ind));
        
        if (isPaywalled) {
            logger.warn(`🚫 Gatekeeper: Paywall detected.`);
            return false;
        }

        return true;
    }

    /**
     * STAGE 3: System-Wide Config Check
     * Checks if we have global "Kill Switches" active
     */
    public async isIngestionEnabled(): Promise<boolean> {
        try {
            const config = await prisma.systemConfig.findUnique({
                where: { key: 'INGESTION_STATUS' }
            });
            
            // Default to TRUE if no config exists
            if (!config) return true;
            
            return !config.value.includes('PAUSED');
        } catch (error) {
            return true; // Fail open
        }
    }
}

export default new GatekeeperService();
