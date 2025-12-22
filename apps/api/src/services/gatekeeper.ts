// apps/api/src/services/gatekeeper.ts
import logger from '../utils/logger';

class GatekeeperService {
  private blockedDomains = [
    'promotions.com', 'giveaway', 'coupons', 'deals', 'slickdeals', 
    'marketwatch.com/press-release', 'prweb.com', 'businesswire.com'
  ];

  private blockedKeywords = [
    'subscription', 'giveaway', 'sweepstakes', 'coupon', 
    'deal of the day', 'limited time offer', 'act now', 
    'press release', 'market research report'
  ];

  /**
   * Determines if an article is "Real News" or junk/spam.
   */
  isValid(title: string, description: string, url: string): boolean {
    const combinedText = (title + ' ' + description).toLowerCase();
    const urlLower = url.toLowerCase();

    // 1. Domain Check
    if (this.blockedDomains.some(d => urlLower.includes(d))) {
      logger.info(`🛡️ Gatekeeper Blocked (Domain): ${url}`);
      return false;
    }

    // 2. Keyword Check (Spam/Ads)
    if (this.blockedKeywords.some(k => combinedText.includes(k))) {
      logger.info(`🛡️ Gatekeeper Blocked (Keyword): ${title.substring(0, 50)}...`);
      return false;
    }

    // 3. Length Quality Check
    if (title.split(' ').length < 4) {
      // Titles with fewer than 4 words are rarely good news headlines
      return false;
    }

    return true;
  }
}

export const gatekeeperService = new GatekeeperService();
