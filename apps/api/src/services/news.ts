// apps/api/src/services/news.ts
import axios from "axios";
import { env } from "../config";

interface NewsArticle {
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

export const newsService = {
  /**
   * Fetches top headlines from GNews
   */
  async fetchHeadlines(category: string = "general", country: string = "us"): Promise<NewsArticle[]> {
    try {
      const url = `https://gnews.io/api/v4/top-headlines?category=${category}&lang=en&country=${country}&max=10&apikey=${env.GNEWS_API_KEY}`;
      
      const response = await axios.get(url);
      
      if (response.status !== 200 || !response.data.articles) {
        console.error("GNews Error:", response.data);
        return [];
      }

      return response.data.articles;
    } catch (error) {
      console.error("News Fetch Error:", error);
      return [];
    }
  },

  /**
   * Fetches articles by specific keyword (for Narratives/Deep Dives)
   */
  async searchNews(query: string): Promise<NewsArticle[]> {
    try {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=5&apikey=${env.GNEWS_API_KEY}`;
      const response = await axios.get(url);
      return response.data.articles || [];
    } catch (error) {
      console.error("News Search Error:", error);
      return [];
    }
  }
};
