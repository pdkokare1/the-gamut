// apps/api/src/services/article-processor.ts
import { prisma } from "@repo/db";
import { redis } from "../utils/redis";
import { TRUSTED_SOURCES, JUNK_KEYWORDS } from '../utils/constants';
import { 
    cleanText, 
    formatHeadline, 
    getSimilarityScore, 
    calculateReadingComplexity 
} from '../utils/helpers';

// Extended Interface for Internal Processing
export interface INewsSourceArticle {
    source: { id?: string; name: string };
    author?: string;
    title: string;
    description?: string;
    url: string;
    urlToImage?: string;
    image?: string; 
    publishedAt: string;
    content?: string;
    category?: string;
    country?: string;
    embedding?: number[];
    
    // Added for Processor pipeline
    score?: number;
    complexityScore?: number;
}

const DEFAULT_WEIGHTS = {
    image_bonus: 2,
    missing_image_penalty: -2,
    missing_image_untrusted_penalty: -10,
    trusted_source_bonus: 5,
    title_length_bonus: 1,
    junk_keyword_penalty: -20,
    min_score_cutoff: 0
};

class ArticleProcessor {

    /**
     * Fetch dynamic weights from Redis or DB to allow tuning without redeploying
     */
    private async getWeights() {
        try {
            // Check Redis First
            // Safe check for Redis readiness (handles both ioredis function and property styles)
            const isRedisReady = typeof redis.isReady === 'function' ? redis.isReady() : redis.isReady;
            
            if (isRedisReady) {
                const cached = await redis.get('CONFIG_SCORING_WEIGHTS');
                if (cached) return JSON.parse(cached);
            }

            // Fallback to DB
            const conf = await prisma.systemConfig.findUnique({ where: { key: 'scoring_weights' } });
            
            // Handle Json value type safely
            if (conf && conf.value && typeof conf.value === 'object') {
                if (isRedisReady) {
                    await redis.set('CONFIG_SCORING_WEIGHTS', JSON.stringify(conf.value), 'EX', 300);
                }
                return { ...DEFAULT_WEIGHTS, ...conf.value };
            }
        } catch (e) {
            // Silent fail to defaults
        }
        return DEFAULT_WEIGHTS;
    }

    /**
     * Main Pipeline: Clean -> Score -> Complexity -> Deduplicate
     */
    public async processBatch(articles: INewsSourceArticle[]): Promise<INewsSourceArticle[]> {
        const weights = await this.getWeights();

        // 1. First pass: Scoring and Basic Cleaning
        const scored = articles.map(a => {
            // Normalize Image Field
            if (!a.image && a.urlToImage) a.image = a.urlToImage;
            
            const score = this.calculateScore(a, weights);
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

            // A. Quality Cutoff (Dynamic)
            if (item.score < weights.min_score_cutoff) continue;

            // B. Text Cleanup
            article.title = formatHeadline(article.title);
            article.description = cleanText(article.description || "");

            // --- RESTORED: Calculate Cognitive Complexity ---
            article.complexityScore = calculateReadingComplexity(article.description);
            article.score = item.score; // Attach final score for debugging/logs

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

    private calculateScore(a: INewsSourceArticle, weights: typeof DEFAULT_WEIGHTS): number {
        let score = 0;
        const titleLower = (a.title || "").toLowerCase();
        const descLower = (a.description || "").toLowerCase();
        const sourceLower = (a.source.name || "").toLowerCase();
        
        const isTrusted = TRUSTED_SOURCES.some(src => sourceLower.includes(src.toLowerCase()));

        // 1. Image Quality
        if (a.image && a.image.startsWith('http')) {
            score += weights.image_bonus;
        } else {
            // Strict penalty for non-trusted sources without images
            if (!isTrusted) score += weights.missing_image_untrusted_penalty; 
            else score += weights.missing_image_penalty; 
        }

        // 2. Title Length
        if (a.title && a.title.length > 40) score += weights.title_length_bonus;

        // 3. Trusted Source Bonus
        if (isTrusted) score += weights.trusted_source_bonus; 

        // 4. JUNK KEYWORDS
        const combinedText = titleLower + " " + descLower;
        if (JUNK_KEYWORDS.some(word => combinedText.includes(word.toLowerCase()))) {
            score += weights.junk_keyword_penalty;
        }

        return score;
    }

    private isValid(article: INewsSourceArticle): boolean {
        if (!article.title || !article.url) return false;
        
        // Strict Validation
        if (article.title.length < 20) return false; 
        if (article.title === "No Title") return false;
        if (!article.description || article.description.length < 30) return false; 
        
        // Word Count Check
        const totalWords = (article.title + " " + article.description).split(/\s+/).length;
        if (totalWords < 40) return false;

        return true;
    }

    private isFuzzyDuplicate(currentTitle: string, existingTitles: string[]): boolean {
        const currentLen = currentTitle.length;
        
        for (const existing of existingTitles) {
            // Optimization: Don't compare if lengths are vastly different
            if (Math.abs(currentLen - existing.length) > 20) continue;
            
            const score = getSimilarityScore(currentTitle, existing);
            if (score > 0.8) return true; 
        }
        return false;
    }
}

export const articleProcessor = new ArticleProcessor();
