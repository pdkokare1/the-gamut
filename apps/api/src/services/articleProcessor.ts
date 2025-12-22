// apps/api/src/services/articleProcessor.ts

import { NewsItem } from './news';

// Constants for scoring
const TRUSTED_SOURCES = ['BBC', 'Reuters', 'AP', 'NPR', 'Bloomberg', 'WSJ', 'The Guardian'];
const JUNK_KEYWORDS = ['deal', 'sale', 'coupon', 'vouchers', 'subscribe', 'giveaway'];

class ArticleProcessor {
  /**
   * Main Pipeline: Clean -> Score -> Deduplicate (Fuzzy)
   */
  public processBatch(articles: NewsItem[]): NewsItem[] {
    // 1. First pass: Scoring and Basic Cleaning
    const scored = articles.map((a) => {
      const score = this.calculateScore(a);
      return { article: a, score };
    });

    // 2. Sort by Quality (Highest Score First)
    scored.sort((a, b) => b.score - a.score);

    const uniqueArticles: NewsItem[] = [];
    const seenUrls = new Set<string>();
    const seenTitles: string[] = [];

    // 3. Selection Loop
    for (const item of scored) {
      const article = item.article;

      // A. Quality Cutoff (Filter out low quality/junk)
      if (item.score < -5) continue;

      // B. Text Cleanup
      article.title = this.formatHeadline(article.title);
      article.description = this.cleanText(article.description || '');

      // C. Validation
      if (!this.isValid(article)) continue;

      // D. Deduplication (Exact URL)
      if (seenUrls.has(article.url)) continue;

      // E. Deduplication (Fuzzy Title)
      // Checks if this headline is >80% similar to one we already picked in this batch
      if (this.isFuzzyDuplicate(article.title, seenTitles)) continue;

      // Accepted!
      seenUrls.add(article.url);
      seenTitles.push(article.title);
      uniqueArticles.push(article);
    }

    // Return sorted by date (newest first)
    return uniqueArticles.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }

  private calculateScore(a: NewsItem): number {
    let score = 0;
    const titleLower = (a.title || '').toLowerCase();
    const sourceLower = (a.source || '').toLowerCase();

    // Image Quality
    if (a.imageUrl && a.imageUrl.startsWith('http')) score += 2;
    else score -= 5;

    // Title Length (Too short is usually bad)
    if (a.title && a.title.length > 40) score += 1;

    // Trusted Source Bonus
    if (TRUSTED_SOURCES.some((src) => sourceLower.includes(src.toLowerCase()))) score += 3;

    // Junk/Clickbait Penalty
    if (JUNK_KEYWORDS.some((word) => titleLower.includes(word))) score -= 20;

    return score;
  }

  private isValid(article: NewsItem): boolean {
    if (!article.title || !article.url) return false;
    if (article.title.length < 15) return false;
    if (article.title === 'No Title') return false;
    if (!article.description || article.description.length < 30) return false;
    return true;
  }

  // --- Utility Functions ---

  private formatHeadline(title: string): string {
    return title
      .replace(/ - [^-]+$/, '') // Remove source suffix like " - CNN"
      .replace(/ \| .+$/, '') // Remove pipe suffix
      .trim();
  }

  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }

  private isFuzzyDuplicate(currentTitle: string, existingTitles: string[]): boolean {
    const currentLen = currentTitle.length;

    for (const existing of existingTitles) {
      if (Math.abs(currentLen - existing.length) > 20) continue;
      if (this.getSimilarityScore(currentTitle, existing) > 0.8) return true;
    }
    return false;
  }

  private getSimilarityScore(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - this.editDistance(longer, shorter)) / longerLength;
  }

  private editDistance(s1: string, s2: string): number {
    const costs: number[] = new Array();
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) costs[j] = j;
        else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) !== s2.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }
}

export const articleProcessor = new ArticleProcessor();
