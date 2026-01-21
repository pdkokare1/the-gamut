// apps/api/src/services/article-processor.ts
import { TRUSTED_SOURCES, JUNK_KEYWORDS } from '../utils/constants';

// Define Interface locally to avoid circular deps if types/index.ts isn't ready
export interface INewsSourceArticle {
    source: { id?: string; name: string };
    author?: string;
    title: string;
    description?: string;
    url: string;
    urlToImage?: string;
    image?: string; // Normalized field
    publishedAt: string;
    content?: string;
    category?: string;
    country?: string;
    embedding?: number[];
}

class ArticleProcessor {

    // --- HELPER: Clean Text ---
    private cleanText(text: string): string {
        if (!text) return "";
        return text
            .replace(/<[^>]*>/g, '') // Strip HTML
            .replace(/\s+/g, ' ')    // Normalize whitespace
            .trim();
    }

    // --- HELPER: Format Headline ---
    private formatHeadline(title: string): string {
        if (!title) return "No Title";
        // Remove common suffixes like " - CNN", " | Fox News"
        return title.split(' - ')[0].split(' | ')[0].trim();
    }

    // --- HELPER: Similarity Score (Jaccard Index for Titles) ---
    private getSimilarityScore(str1: string, str2: string): number {
        const set1 = new Set(str1.toLowerCase().split(/\s+/));
        const set2 = new Set(str2.toLowerCase().split(/\s+/));
        
        // Intersection
        let intersection = 0;
        set1.forEach(word => { if (set2.has(word)) intersection++; });
        
        // Union
        const union = set1.size + set2.size - intersection;
        return union === 0 ? 0 : intersection / union;
    }

    /**
     * Main Pipeline: Clean -> Score -> Deduplicate (Fuzzy)
     */
    public processBatch(articles: INewsSourceArticle[]): INewsSourceArticle[] {
        // 1. First pass: Scoring and Basic Cleaning
        const scored = articles.map(a => {
            // Normalize Image Field
            if (!a.image && a.urlToImage) a.image = a.urlToImage;
            
            const score = this.calculateScore(a);
            return { article: a, score };
        });

        // 2. Sort by Quality (Highest Score First)
        scored.sort((a, b) => b.score - a.score);

        const uniqueArticles: INewsSourceArticle[] = [];
        const seenUrls = new Set<string>();
        const seenTitles: string[] = [];

        // 3. Selection Loop
        for (const item of scored) {
            const article = item.article;

            // A. Quality Cutoff (The "Trap")
            // Articles with score < 0 are rejected (mostly due to Junk Keywords)
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

            // Accepted!
            seenUrls.add(article.url);
            seenTitles.push(article.title);
            uniqueArticles.push(article);
        }

        // Return sorted by date (Newest first) for the feed
        return uniqueArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    }

    private calculateScore(a: INewsSourceArticle): number {
        let score = 0;
        const titleLower = (a.title || "").toLowerCase();
        const descLower = (a.description || "").toLowerCase();
        const sourceLower = (a.source.name || "").toLowerCase();
        
        const isTrusted = TRUSTED_SOURCES.some(src => sourceLower.includes(src.toLowerCase()));

        // 1. Image Quality
        if (a.image && a.image.startsWith('http')) {
            score += 2;
        } else {
            // Strict penalty for non-trusted sources without images
            if (!isTrusted) score -= 10; 
            else score -= 2; // Trusted sources get a pass
        }

        // 2. Title Length (Avoid tiny tickers)
        if (a.title && a.title.length > 40) score += 1;

        // 3. Trusted Source Bonus
        if (isTrusted) score += 5; 

        // 4. JUNK KEYWORDS (The "Trap")
        // Immediate -20 penalty ensures these almost never pass the cutoff (0)
        const combinedText = titleLower + " " + descLower;
        if (JUNK_KEYWORDS.some(word => combinedText.includes(word.toLowerCase()))) {
            score -= 20;
        }

        return score;
    }

    private isValid(article: INewsSourceArticle): boolean {
        if (!article.title || !article.url) return false;
        
        // Filter out very short content
        if (article.title.length < 15) return false; 
        if (article.title === "No Title") return false;
        if (!article.description || article.description.length < 30) return false; 
        
        // Word Count Check (Garbage In -> Garbage Out Prevention)
        const totalWords = (article.title + " " + article.description).split(/\s+/).length;
        if (totalWords < 30) return false;

        return true;
    }

    private isFuzzyDuplicate(currentTitle: string, existingTitles: string[]): boolean {
        const currentLen = currentTitle.length;
        
        for (const existing of existingTitles) {
            // Optimization: Don't compare if lengths are vastly different
            if (Math.abs(currentLen - existing.length) > 20) continue;
            
            const score = this.getSimilarityScore(currentTitle, existing);
            if (score > 0.75) { // 75% similarity threshold
                return true; 
            }
        }
        return false;
    }
}

export const articleProcessor = new ArticleProcessor();
