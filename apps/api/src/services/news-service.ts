import apiClient from '../utils/apiClient';
import KeyManager from '../utils/KeyManager';
import { logger } from '../utils/logger';
import config from '../config';

// Define the shape of a raw GNews Article
export interface GNewsArticle {
    title: string;
    description: string;
    content: string;
    url: string;
    image: string;
    publishedAt: string;
    source: {
        name: string;
        url: string;
    };
}

class NewsService {
    constructor() {
        // Register Keys on Startup
        if (config.keys?.gnews && config.keys.gnews.length > 0) {
            KeyManager.registerProviderKeys('GNEWS', config.keys.gnews);
        } else {
            logger.warn("⚠️ No GNews API Keys found in config.");
        }
    }

    /**
     * Fetches Top Headlines using Key Rotation
     */
    async fetchTopHeadlines(category: string = 'general', country: string = 'in'): Promise<GNewsArticle[]> {
        const query = category === 'general' ? 'news' : category;
        
        try {
            const data = await KeyManager.executeWithRetry<any>('GNEWS', async (apiKey) => {
                const url = `https://gnews.io/api/v4/top-headlines?category=${category}&lang=en&country=${country}&max=10&apikey=${apiKey}`;
                const response = await apiClient.get(url, { timeout: 10000 });
                return response.data;
            });

            if (!data.articles) {
                throw new Error('GNews returned no articles array');
            }

            logger.info(`📰 Fetched ${data.articles.length} raw articles for [${category}]`);
            return data.articles;

        } catch (error: any) {
            logger.error(`News Fetch Failed [${category}]: ${error.message}`);
            return [];
        }
    }

    /**
     * Fetches specific keyword search (for Cluster Updates)
     */
    async searchNews(query: string): Promise<GNewsArticle[]> {
        try {
            const encodedQuery = encodeURIComponent(query);
            const data = await KeyManager.executeWithRetry<any>('GNEWS', async (apiKey) => {
                const url = `https://gnews.io/api/v4/search?q=${encodedQuery}&lang=en&country=in&max=5&apikey=${apiKey}`;
                const response = await apiClient.get(url);
                return response.data;
            });

            return data.articles || [];
        } catch (error: any) {
            logger.error(`News Search Failed [${query}]: ${error.message}`);
            return [];
        }
    }
}

export default new NewsService();
