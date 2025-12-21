import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(config.geminiKey);

const modelFlash = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
const modelPro = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

// System Instruction for News Analysis
const ANALYSIS_PROMPT = `
You are an objective AI news analyst. Your task is to analyze the provided news article text.
Output MUST be valid JSON with the following structure:
{
  "summary": "A concise 2-sentence summary.",
  "politicalLean": "Left" | "Center" | "Right",
  "sentiment": "Positive" | "Negative" | "Neutral",
  "biasScore": 0-100 (number),
  "trustScore": 0-100 (number),
  "keyFindings": ["Point 1", "Point 2", "Point 3"],
  "category": "Politics" | "Technology" | "Health" | "Business" | "World"
}
`;

export const aiService = {
  // 1. Analyze a single article
  analyzeArticle: async (text: string, title: string) => {
    try {
      const prompt = `${ANALYSIS_PROMPT}\n\nHeadline: ${title}\nText: ${text.substring(0, 5000)}`;
      
      const result = await modelFlash.generateContent(prompt);
      const response = result.response;
      const jsonString = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('AI Analysis Failed:', error);
      // Fallback for safety
      return {
        summary: "Analysis unavailable.",
        politicalLean: "Center",
        sentiment: "Neutral",
        biasScore: 0,
        trustScore: 50,
        keyFindings: [],
        category: "General"
      };
    }
  },

  // 2. Generate Embeddings (For Smart Search)
  generateEmbedding: async (text: string) => {
    const model = genAI.getGenerativeModel({ model: "embedding-001" });
    const result = await model.embedContent(text);
    return result.embedding.values;
  }
};
