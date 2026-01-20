// apps/api/src/services/article-processor.ts
import { NewsArticle } from './gnews'; // Assuming interface exists
import { TRUSTED_SOURCES, JUNK_KEYWORDS } from '../utils/constants';

class ArticleProcessor {

    /**
     * Main Pipeline: Clean -> Score -> Deduplicate (Fuzzy)
     * Mirrors old narrative-backend/services/articleProcessor.ts logic
     */
    public processBatch(articles: NewsArticle[]): any[] {
        // 1. First pass: Scoring and Basic Cleaning
        const scored = articles.map(a => ({
            article: a,
            score: this.calculateScore(a)
        }));

        // 2. Sort by Quality (Highest Score First)
        scored.sort((a, b) => b.score - a.score);

        const uniqueArticles: any[] = [];
        const seenUrls = new Set<string>();
        const seenTitles: string[] = [];

        // 3. Selection Loop
        for (const item of scored) {
            const article = item.article;

            // A. Quality Cutoff (Matches old "Raised Bar" logic)
            // Score < 0 items are discarded (usually junk keywords or untrusted no-image)
            if (item.score < 0) continue;

            // B. Text Cleanup
            article.title = this.formatHeadline(article.title);
            article.description = this.cleanText(article.description || "");

            // C. Validation (Length & Word Count checks)
            if (!this.isValid(article)) continue;

            // D. Deduplication (Exact URL)
            if (seenUrls.has(article.url)) continue;

            // E. Deduplication (Fuzzy Title)
            if (this.isFuzzyDuplicate(article.title, seenTitles)) continue;

            // Accepted!
            seenUrls.add(article.url);
            seenTitles.push(article.title);
            
            // Return shape ready for Prisma/DB Service
            uniqueArticles.push({
                ...article,
                source: typeof article.source === 'object' ? article.source.name : article.source,
                // Default scores (will be updated by AI Service later)
                biasScore: 0,
                credibilityScore: 0,
                reliabilityScore: 0,
                trustScore: 0,
                isLatest: true
            });
        }

        return uniqueArticles;
    }

    /**
     * EXACT PORT of old calculateScore logic
     */
    private calculateScore(a: NewsArticle): number {
        let score = 0;
        const titleLower = (a.title || "").toLowerCase();
        const sourceLower = (typeof a.source === 'object' ? a.source.name : a.source || "").toLowerCase();
        
        const isTrusted = TRUSTED_SOURCES.some(src => sourceLower.includes(src.toLowerCase()));

        // Image Quality Rules
        if (a.image && a.image.startsWith('http')) {
            score += 2;
        } else {
            if (!isTrusted) {
                // Strict penalty for untrusted sources without images
                score -= 10; 
            } else {
                 // Trusted sources get a pass but small penalty
                 score -= 2;
            }
        }

        // Title Length Bonus
        if (a.title && a.title.length > 40) score += 1;

        // Trusted Source Bonus
        if (isTrusted) score += 5; 

        // Junk/Clickbait Penalty (The Trap)
        if (JUNK_KEYWORDS.some(word => titleLower.includes(word))) score -= 20;

        return score;
    }

    private isValid(article: NewsArticle): boolean {
        if (!article.title || !article.url) return false;
        
        // Filter out short "ticker" updates
        if (article.title.length < 20) return false; 
        
        if (article.title === "No Title") return false;
        if (!article.description || article.description.length < 30) return false; 
        
        // Word Count Check (prevent "Garbage In")
        // If Title + Desc < 40 words, AI context window struggles
        const totalWords = (article.title + " " + article.description).split(/\s+/).length;
        if (totalWords < 40) return false;

        return true;
    }

    private isFuzzyDuplicate(currentTitle: string, existingTitles: string[]): boolean {
        for (const existing of existingTitles) {
            // Optimization: Skip if length difference is massive
            if (Math.abs(currentTitle.length - existing.length) > 20) continue;
            
            const similarity = this.getSimilarityScore(currentTitle, existing);
            // Threshold > 0.8 means 80% similar -> Duplicate
            if (similarity > 0.8) return true;
        }
        return false;
    }

    // --- Helpers ---

    private cleanText(text: string): string {
        if (!text) return "";
        return text
            .replace(/<[^>]*>/g, '') // Remove HTML
            .replace(/\s+/g, ' ')    // Collapse whitespace
            .trim();
    }

    private formatHeadline(headline: string): string {
        if (!headline) return "";
        // Remove common suffixes like " - CNN", " | BBC News"
        return headline.split(' - ')[0].split(' | ')[0].trim();
    }

    // Jaccard Similarity for fuzzy matching
    private getSimilarityScore(str1: string, str2: string): number {
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();
        if (s1 === s2) return 1;
        
        const pairs1 = this.getPairs(s1);
        const pairs2 = this.getPairs(s2);
        const union = pairs1.size + pairs2.size;
        
        if (union === 0) return 0;

        let intersection = 0;
        pairs1.forEach(pair => {
            if (pairs2.has(pair)) intersection++;
        });
        
        return (2.0 * intersection) / union;
    }

    private getPairs(str: string): Set<string> {
        const pairs = new Set<string>();
        for (let i = 0; i < str.length - 1; i++) {
            pairs.add(str.slice(i, i + 2));
        }
        return pairs;
    }
}

export default new ArticleProcessor();
