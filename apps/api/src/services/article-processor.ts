import { NewsArticle } from './gnews';

// Constants moved here for safety
const TRUSTED_SOURCES = ['Reuters', 'AP', 'BBC', 'NPR', 'PBS', 'Bloomberg', 'WSJ', 'The Guardian', 'Financial Times'];
const JUNK_KEYWORDS = ['horoscope', 'deal of the day', 'best seller', 'gift guide', 'coupon', 'lottery', 'sex', 'dating', 'casino'];

class ArticleProcessor {

    /**
     * Main Pipeline: Clean -> Score -> Deduplicate (Fuzzy)
     */
    public processBatch(articles: NewsArticle[]): any[] {
        // 1. Score
        const scored = articles.map(a => ({
            article: a,
            score: this.calculateScore(a)
        }));

        // 2. Sort by Quality
        scored.sort((a, b) => b.score - a.score);

        const uniqueArticles: any[] = [];
        const seenUrls = new Set<string>();
        const seenTitles: string[] = [];

        // 3. Selection Loop
        for (const item of scored) {
            const article = item.article;

            // A. Quality Cutoff
            if (item.score < 0) continue;

            // B. Text Cleanup
            article.title = this.formatHeadline(article.title);
            article.description = this.cleanText(article.description || "");

            // C. Validation
            if (!this.isValid(article)) continue;

            // D. Deduplication (Exact URL)
            if (seenUrls.has(article.url)) continue;

            // E. Deduplication (Fuzzy Title)
            if (this.isFuzzyDuplicate(article.title, seenTitles)) continue;

            seenUrls.add(article.url);
            seenTitles.push(article.title);
            
            // Return shape ready for Prisma
            uniqueArticles.push({
                ...article,
                source: article.source.name, // Flatten source object to string
                biasScore: 0,
                credibilityScore: 0,
                reliabilityScore: 0,
                trustScore: 0,
                isLatest: true
            });
        }

        return uniqueArticles;
    }

    private calculateScore(a: NewsArticle): number {
        let score = 0;
        const titleLower = (a.title || "").toLowerCase();
        const sourceLower = (a.source.name || "").toLowerCase();
        
        const isTrusted = TRUSTED_SOURCES.some(src => sourceLower.includes(src.toLowerCase()));

        if (a.image && a.image.startsWith('http')) {
            score += 2;
        } else {
            if (!isTrusted) score -= 10;
            else score -= 2;
        }

        if (a.title && a.title.length > 40) score += 1;
        if (isTrusted) score += 5; 
        if (JUNK_KEYWORDS.some(word => titleLower.includes(word))) score -= 20;

        return score;
    }

    private isValid(article: NewsArticle): boolean {
        if (!article.title || !article.url) return false;
        if (article.title.length < 20) return false;
        if (!article.description || article.description.length < 30) return false;
        
        const totalWords = (article.title + " " + article.description).split(/\s+/).length;
        if (totalWords < 40) return false;

        return true;
    }

    private isFuzzyDuplicate(currentTitle: string, existingTitles: string[]): boolean {
        for (const existing of existingTitles) {
            if (Math.abs(currentTitle.length - existing.length) > 20) continue;
            // Simple Jaccard-like check for speed
            const similarity = this.getSimilarityScore(currentTitle, existing);
            if (similarity > 0.8) return true;
        }
        return false;
    }

    // --- Helpers Inlined for Portability ---

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

    private getSimilarityScore(str1: string, str2: string): number {
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();
        if (s1 === s2) return 1;
        
        const pairs1 = this.getPairs(s1);
        const pairs2 = this.getPairs(s2);
        const union = pairs1.size + pairs2.size;
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
