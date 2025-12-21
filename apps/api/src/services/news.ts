import { config } from '../config';

interface RawNewsItem {
  title: string;
  url: string;
  source: { name: string };
  description: string;
  urlToImage?: string;
  publishedAt: string;
  content?: string;
}

export const newsService = {
  fetchLatest: async (): Promise<RawNewsItem[]> => {
    // We can swap this URL based on which provider you prefer (NewsAPI, GNews, Mediastack)
    // Using NewsAPI format as default example
    const url = `https://newsapi.org/v2/top-headlines?language=en&pageSize=20&apiKey=${process.env.NEWS_API_KEY}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      return data.articles || [];
    } catch (error) {
      console.error("News Fetch Error:", error);
      return [];
    }
  }
};
