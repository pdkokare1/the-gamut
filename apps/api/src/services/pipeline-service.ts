import { prisma } from '@gamut/db';
import { logger } from '../utils/logger';
import newsService, { GNewsArticle } from './news-service';
import gatekeeperService from './gatekeeper';
import articleProcessor, { INewsSourceArticle } from './article-processor';
import clusteringService from './clustering';
import aiService from './ai';

class PipelineService {
    
    // =========================================================
    // MAIN ENTRY POINT
    // =========================================================
    public async runIngestionPipeline(category: string = 'general'): Promise<void> {
        logger.info(`🚀 Starting Ingestion Pipeline for: ${category}`);

        // 1. FETCH
        const rawArticles = await newsService.fetchTopHeadlines(category, 'in');
        if (!rawArticles.length) {
            logger.warn(`No articles found for ${category}. Aborting.`);
            return;
        }

        // 2. NORMALIZE & FILTER (The "Processor")
        const normalized: INewsSourceArticle[] = rawArticles.map(a => ({
            title: a.title,
            description: a.description,
            content: a.content,
            url: a.url,
            image: a.image,
            publishedAt: a.publishedAt,
            source: { name: a.source.name, url: a.source.url },
            category: category,
            country: 'India' // Hardcoded for now, can be dynamic later
        }));

        // Applies Quality Score & Deduplication
        const validArticles = articleProcessor.processBatch(normalized);
        logger.info(`✨ Filtered: ${rawArticles.length} -> ${validArticles.length} high-quality items.`);

        // 3. PROCESS EACH ARTICLE
        let newCount = 0;
        for (const article of validArticles) {
            try {
                const processed = await this.processSingleArticle(article);
                if (processed) newCount++;
            } catch (err: any) {
                logger.error(`Failed to process ${article.url}: ${err.message}`);
            }
        }

        logger.info(`🏁 Pipeline Complete [${category}]: ${newCount} new articles saved.`);
    }

    // =========================================================
    // INDIVIDUAL PROCESSING (The "Smart" Logic)
    // =========================================================
    private async processSingleArticle(item: INewsSourceArticle): Promise<boolean> {
        
        // A. GATEKEEPER CHECK (Domain Blacklist)
        if (!gatekeeperService.isAllowedSource(item.url, item.source.name)) {
            return false;
        }

        // B. DATABASE CHECK (Existence)
        const exists = await prisma.article.findUnique({ where: { url: item.url } });
        if (exists) return false; // Already have it

        // C. AI ANALYSIS (The Heavy Lifting)
        // We do this BEFORE saving to ensure we have metadata
        const aiAnalysis = await aiService.analyzeArticle({
            headline: item.title,
            summary: item.description,
            content: item.content
        }, 'gemini-1.5-flash', 'Full');

        // D. EMBEDDING GENERATION
        const embedding = await aiService.createEmbedding(`${item.title} ${item.description}`);
        
        // E. CLUSTERING (Assign ID)
        const clusterId = await clusteringService.assignClusterId({
            headline: item.title,
            clusterTopic: aiAnalysis.clusterTopic || item.title,
            category: item.category,
            country: item.country
        }, embedding || []);

        // F. SAVE TO DB (Prisma)
        const saved = await prisma.article.create({
            data: {
                headline: item.title,
                summary: aiAnalysis.summary, // Use AI summary
                url: item.url,
                imageUrl: item.image,
                publishedAt: new Date(item.publishedAt),
                source: item.source.name,
                category: item.category || 'General',
                country: item.country || 'Global',
                
                // AI Data
                analysisType: aiAnalysis.analysisType,
                sentiment: aiAnalysis.sentiment,
                politicalLean: aiAnalysis.politicalLean,
                biasScore: aiAnalysis.biasScore,
                biasLabel: aiAnalysis.biasLabel,
                credibilityScore: aiAnalysis.credibilityScore,
                reliabilityScore: aiAnalysis.reliabilityScore,
                trustScore: aiAnalysis.trustScore,
                
                // Complex AI Fields
                biasComponents: aiAnalysis.biasComponents ?? {},
                credibilityComponents: aiAnalysis.credibilityComponents ?? {},
                reliabilityComponents: aiAnalysis.reliabilityComponents ?? {},
                
                keyFindings: aiAnalysis.keyFindings || [],
                recommendations: aiAnalysis.recommendations || [],
                
                // Clustering
                clusterId: clusterId,
                clusterTopic: aiAnalysis.clusterTopic,
                
                // Vector
                embedding: embedding || [],
                
                // Defaults
                isLatest: true
            }
        });

        // G. POST-SAVE OPTIMIZATION
        // Ensure only this new article is shown in the feed for this cluster
        if (saved.clusterId) {
            await clusteringService.optimizeClusterFeed(saved.clusterId);
        }

        return true;
    }
}

export default new PipelineService();
