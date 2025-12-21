export const gatekeeperService = {
  // Blacklisted keywords that indicate low-quality or irrelevant content
  blacklistedKeywords: [
    'gossip', 'celeb', 'kardashian', 'horoscope', 'lottery', 
    'coupon', 'deal of the day', 'click here', 'subscribe now',
    'sex', 'porn', 'xxx', 'dating', 'casino'
  ],

  // Blacklisted sources (if any specific domains are spammy)
  blacklistedDomains: [
    'tmz.com', 'perezhilton.com', 'dailymail.co.uk' // Example
  ],

  /**
   * Evaluates if an article is valid for the platform.
   */
  isValid(title: string, description: string, source: string): boolean {
    const text = (title + ' ' + description).toLowerCase();

    // 1. Check for valid length
    if (text.length < 50) return false; // Too short to be news

    // 2. Check Blacklisted Sources
    if (this.blacklistedDomains.some(d => source.toLowerCase().includes(d))) {
      return false;
    }

    // 3. Check Blacklisted Keywords
    if (this.blacklistedKeywords.some(w => text.includes(w))) {
      return false;
    }

    return true;
  }
};
