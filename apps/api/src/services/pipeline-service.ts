// apps/api/src/services/pipeline-service.ts
import crypto from 'crypto';
import redisHelper from '../utils/redis';
import { logger } from '../utils/logger';
import articleProcessor from './article-processor';

// Types for input data (matches GNews article)
interface QueueArticleData {
    url: string;
    title: string;
    description: string;
    content: string;
    image: string;
    publishedAt: string;
    source: { name: string; url?: string };
}

class PipelineService {

    /**
     * Processes a single article from the Queue.
     * 1. Retrieves cached embedding (Sidecar pattern).
     * 2. Delegates to ArticleProcessor.
     */
    async processSingleArticle(data: QueueArticleData): Promise<{ status: string; articleId?: string }> {
        try {
            const urlHash = crypto.createHash('md5').update(data.url).digest('hex');
            
            // 1. Check for Pre-computed Embedding in Redis
            // This was saved by the Producer (handlers.ts) to save AI tokens
            const embeddingKey = `temp:embedding:${urlHash}`;
            const cachedEmbedding = await redisHelper.get<number[]>(embeddingKey);
            
            let preComputedEmbedding: number[] | undefined = undefined;
            if (cachedEmbedding && Array.isArray(cachedEmbedding) && cachedEmbedding.length > 0) {
                logger.debug(`⚡ Cache Hit: Using pre-computed embedding for ${urlHash.substring(0, 8)}`);
                preComputedEmbedding = cachedEmbedding;
                
                // Cleanup: We can delete the temp key now to save Redis memory
                // await redisHelper.del(embeddingKey); 
            }

            // 2. Normalize Input for Processor
            const rawInput = {
                title: data.title,
                link: data.url,
                description: data.description,
                content: data.content,
                pubDate: data.publishedAt,
                image_url: data.image,
                source: { name: data.source?.name || 'Unknown' }
            };

            // 3. Delegate to Processor
            const success = await articleProcessor.processSingleArticle(rawInput, preComputedEmbedding);

            if (success) {
                return { status: 'completed', articleId: urlHash };
            } else {
                return { status: 'skipped' }; // Duplicate or Filtered
            }

        } catch (error: any) {
            logger.error(`Pipeline Error processing ${data.url}: ${error.message}`);
            throw error; // Let BullMQ handle retry
        }
    }
}

export const pipelineService = new PipelineService();
