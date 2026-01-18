// apps/api/src/services/gnews.ts
import { z } from 'zod';
import https from 'https';
import { inspect } from 'util';
import KeyManager from '../utils/KeyManager';
import apiClient from '../utils/apiClient';
import config from '../config';
import { logger } from '../utils/logger';

// Standardized Internal Article Interface
export interface NewsArticle {
    title: string;
    description: string;
    content: string;
    url: string;
    image: string;
    publishedAt: string;
    source: { name: string; url?: string };
}

// Zod Schemas for API Validation
const GNewsArticleSchema = z.object({
    source: z.object({ name: z.string().optional(), url: z.string().optional() }).optional(),
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    url: z.string().url(),
    image: z.string().nullable().optional(),
    publishedAt: z.string().optional()
});

const GNewsResponseSchema = z.object({
    totalArticles: z.number().optional(),
    articles: z.array(GNewsArticleSchema).optional()
});

export class GNewsProvider {
    name = 'GNews';

    constructor() {
        // Register keys from the unified config
        const keys = config.keys.gnews || [];
        if (keys.length > 0) {
            KeyManager.registerProviderKeys('GNEWS', keys);
        } else {
            logger.warn('⚠️ GNewsProvider initialized without keys.');
        }
    }

    async fetchArticles(params: any): Promise<NewsArticle[]> {
        // FAIL FAST: If no keys are configured
        if (config.keys.gnews.length === 0) {
            logger.warn('❌ GNews Fetch Skipped: No API keys configured.');
            return [];
        }

        return KeyManager.executeWithRetry<NewsArticle[]>('GNEWS', async (apiKey) => {
            
            const cleanKey = apiKey.trim();
            const dynamicMax = 10; // Optimized for Free Tier

            logger.debug(`🛡️ Using GNews Key (...${cleanKey.slice(-4)}). Fetching ${dynamicMax} articles.`);

            const queryParams = { 
                lang: 'en', 
                sortby: 'publishedAt', 
                max: dynamicMax,
                ...params, 
                apikey: cleanKey,
                token: cleanKey // Support both param styles
            };
            
            const url = 'https://gnews.io/api/v4/top-headlines';

            // NETWORK FIX: Force IPv4 and Disable Keep-Alive
            // Critical for Railway/Vercel shared IPs
            const agent = new https.Agent({
                keepAlive: false, 
                family: 4 
            });

            try {
                const response = await apiClient.get<unknown>(url, { 
                    params: queryParams,
                    timeout: 30000, 
                    httpsAgent: agent,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NarrativeBot/1.0',
                        'Connection': 'close' 
                    }
                });
                
                return this.normalize(response.data);

            } catch (error: any) {
                const status = error.response?.status;
                const message = error.message || 'Unknown Error';
                
                if (status === 401 || status === 403) {
                    logger.error(`❌ GNews Auth Failed (${status}) - Rotating Key`);
                    throw new Error(`[GNews Auth] ${message}`);
                } 
                
                if (status === 429) {
                    logger.warn(`⏳ GNews Rate Limit (429) - Rotating Key`);
                    throw new Error(`[GNews RateLimit] ${message}`);
                }

                logger.error(`❌ GNews Fetch Error: ${message}`);
                throw error;
            }
        });
    }

    private normalize(data: any): NewsArticle[] {
        const result = GNewsResponseSchema.safeParse(data);

        if (!result.success) {
            logger.error(`[GNews] Schema Mismatch`);
            return [];
        }

        return (result.data.articles || [])
            .filter(a => a.url)
            .map(a => ({
                source: { name: a.source?.name || 'GNews', url: a.source?.url || '' },
                title: a.title || "",
                description: a.description || a.content || "",
                url: a.url!,
                content: a.content || "",
                image: a.image || "",
                publishedAt: a.publishedAt || new Date().toISOString()
            }));
    }
}

export default new GNewsProvider();
