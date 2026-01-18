// apps/api/src/services/ai.ts
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { env } from "../config"; // Ensure you have env variables exported here

// Initialize Gemini
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

const MODEL_FAST = "gemini-2.0-flash-exp"; // Fast, cheap (for summaries/classification)
const MODEL_SMART = "gemini-1.5-pro-latest"; // High reasoning (for bias/trust scores)
const MODEL_EMBED = "text-embedding-004";

// Define strict output schemas for JSON mode (Reliability 100%)
const analysisSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    politicalLean: { type: SchemaType.STRING, enum: ["Left", "Center", "Right"] },
    sentiment: { type: SchemaType.STRING, enum: ["Positive", "Negative", "Neutral"] },
    biasScore: { type: SchemaType.NUMBER },
    trustScore: { type: SchemaType.NUMBER },
    keyFindings: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    primaryNoun: { type: SchemaType.STRING },
    category: { type: SchemaType.STRING }
  },
  required: ["summary", "politicalLean", "biasScore", "trustScore", "keyFindings", "category"]
};

export const aiService = {
  /**
   * Analyzes an article using Gemini Flash for speed and cost-efficiency.
   * Returns structured JSON data ready for the database.
   */
  async analyzeArticle(title: string, content: string, source: string) {
    try {
      const model = genAI.getGenerativeModel({
        model: MODEL_FAST,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: analysisSchema,
        },
      });

      const prompt = `
        Analyze this news article. act as an objective editor.
        Title: ${title}
        Source: ${source}
        Content Snippet: ${content.substring(0, 3000)}...

        Tasks:
        1. Summarize in 3 concise sentences.
        2. Determine Political Lean (Left, Center, Right).
        3. Calculate Bias Score (0-100, where 0 is neutral, 100 is propaganda).
        4. Calculate Trust Score (0-100 based on facts vs opinion).
        5. Extract 3-5 Key Findings (bullet points).
        6. Identify the primary entity (Noun) for clustering.
        7. Categorize (Politics, Tech, Business, Health, Science, Sports, Entertainment).
      `;

      const result = await model.generateContent(prompt);
      const response = result.response.text();
      
      return JSON.parse(response);
    } catch (error) {
      console.error("AI Analysis Failed:", error);
      // Fallback for failed analysis
      return {
        summary: "Analysis unavailable.",
        politicalLean: "Center",
        biasScore: 0,
        trustScore: 50,
        keyFindings: [],
        category: "General"
      };
    }
  },

  /**
   * Generates Vector Embeddings for Semantic Search / Clustering
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const model = genAI.getGenerativeModel({ model: MODEL_EMBED });
      const result = await model.embedContent(text.substring(0, 2048)); // Truncate for limit
      return result.embedding.values;
    } catch (error) {
      console.error("Embedding Error:", error);
      return []; // Return empty array on failure (non-blocking)
    }
  }
};
