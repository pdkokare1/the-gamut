// apps/api/src/services/news.ts
import { z } from 'zod';
import { config } from '../config';
import keyManager from '../utils/KeyManager';
import circuitBreaker from '../utils/CircuitBreaker';
import logger from '../utils/logger';
import redisHelper from '../utils/redis';

// --- Types ---
export interface NewsItem {
  title: string;
  url: string;
  source: string;
  description: string;
  imageUrl?: string;
  publishedAt: Date;
  content?: string;
}

// --- Providers ---

class GNewsProvider {
  async fetch(query: string = 'general'): Promise<NewsItem[]> {
    return keyManager.executeWithRetry('GNEWS', async (apiKey) => {
      const url = `https://gnews.io/api/v4/top-headlines?lang=en&max=10&q=${query}&apikey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GNews ${res.status}: ${res.statusText}`);
      
      const data = await res.json();
      return (data.articles || []).map((a: any) => ({
        title: a.title,
        url: a.url,
        source: a.source?.name || 'GNews',
        description: a.description || '',
        imageUrl: a.image,
        publishedAt: new Date(a.publishedAt)
      }));
    });
  }
}

class NewsApiProvider {
  async fetch(category: string = 'general'): Promise<NewsItem[]> {
    return keyManager.executeWithRetry('NEWS_API', async (apiKey) => {
      const url = `https://newsapi.org/v2/top-headlines?language=en&pageSize=20&category=${category}&apiKey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`NewsAPI ${res.status}: ${res.statusText}`);
      
      const data = await res.json();
      return (data.articles || []).map((a: any) => ({
        title: a.title,
        url: a.url,
        source: a.source?.name || 'NewsAPI',
        description: a.description || '',
        imageUrl: a.urlToImage,
        publishedAt: new Date(a.publishedAt)
      }));
    });
  }
}

// --- Main Service ---

class NewsService {
  private gnews = new GNewsProvider();
  private newsapi = new NewsApiProvider();
  private categories = ['general', 'technology', 'business', 'politics', 'science', 'health'];

  async fetchLatest(): Promise<NewsItem[]> {
    // 1. Cycle Categories (Stored in Redis to rotate every run)
    const categoryIndex = await redisHelper.incr('NEWS_CYCLE_INDEX');
    const currentCategory = this.categories[categoryIndex % this.categories.length];
    logger.info(`📰 Fetching News Category: ${currentCategory}`);

    let articles: NewsItem[] = [];

    // 2. Strategy: Try GNews First
    if (await this.shouldTry('GNEWS')) {
      try {
        const res = await this.gnews.fetch(currentCategory);
        articles.push(...res);
      } catch (e) {
        await circuitBreaker.recordFailure('GNEWS');
      }
    }

    // 3. Fallback: NewsAPI (If GNews failed or returned few results)
    if (articles.length < 5 && await this.shouldTry('NEWS_API')) {
      logger.info('⚠️ Low yield/Error from GNews. Engaging NewsAPI fallback.');
      try {
        const res = await this.newsapi.fetch(currentCategory);
        articles.push(...res);
      } catch (e) {
        await circuitBreaker.recordFailure('NEWS_API');
      }
    }

    return this.deduplicate(articles);
  }

  private async shouldTry(provider: string) {
    return !(await circuitBreaker.isOpen(provider));
  }

  private deduplicate(articles: NewsItem[]): NewsItem[] {
    const seen = new Set();
    return articles.filter(a => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });
  }
}

export const newsService = new NewsService();
