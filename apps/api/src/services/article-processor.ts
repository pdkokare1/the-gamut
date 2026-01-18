// apps/api/src/services/article-processor.ts
import { JUNK_KEYWORDS, TRUSTED_SOURCES } from '../utils/constants';

// Helper: Similarity Score (Levenshtein/Jaccard simplified)
const getSimilarityScore = (s1: string, s2: string): number => {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    return (longer.length - editDistance(longer, shorter)) / longer.length;
};

const editDistance = (s1: string, s2: string) => {
    const costs = new Array();
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0) costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) != s2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
};

export const articleProcessor = {
    /**
     * Determines if an article is worth processing.
     * Returns a score. If < 0, it should be rejected.
     */
    calculateQualityScore(article: any): number {
        let score = 0;
        const titleLower = (article.title || article.headline || "").toLowerCase();
        const sourceLower = (article.source?.name || article.source || "").toLowerCase();
        
        // 1. Source Trust
        const isTrusted = TRUSTED_SOURCES.some(src => sourceLower.includes(src.toLowerCase()));
        if (isTrusted) score += 5;

        // 2. Image Validations
        const hasImage = article.image || article.imageUrl;
        if (hasImage && hasImage.startsWith('http')) {
            score += 2;
        } else {
            // Penalty for no image unless it's a highly trusted text source
            score -= isTrusted ? 2 : 10;
        }

        // 3. Content Depth
        if (titleLower.length > 40) score += 1;
        const descLength = (article.description || article.summary || "").length;
        if (descLength < 50) score -= 5;

        // 4. The "Trap" (Junk Keywords)
        // Instant kill for clickbait or unwanted topics
        if (JUNK_KEYWORDS.some(word => titleLower.includes(word))) score -= 20;

        return score;
    },

    /**
     * Strict Validation Check
     */
    isValid(article: any): boolean {
        if (!article.title && !article.headline) return false;
        if (!article.url) return false;

        const title = article.title || article.headline;
        const desc = article.description || article.summary || "";

        // Filter out "Ticker" updates or empty shells
        if (title.length < 15) return false;
        if (title === "No Title") return false;
        
        // Word Count Check (AI needs at least ~40 words to summarize)
        const totalWords = (title + " " + desc).split(/\s+/).length;
        if (totalWords < 20) return false;

        return true;
    },

    /**
     * Fuzzy Title Matcher
     */
    isFuzzyDuplicate(currentTitle: string, existingTitles: string[]): boolean {
        const currentLen = currentTitle.length;
        
        for (const existing of existingTitles) {
            // Optimization: Skip if length difference is huge
            if (Math.abs(currentLen - existing.length) > 20) continue;
            
            const score = getSimilarityScore(currentTitle.toLowerCase(), existing.toLowerCase());
            if (score > 0.85) return true; // 85% match = duplicate
        }
        return false;
    }
};
