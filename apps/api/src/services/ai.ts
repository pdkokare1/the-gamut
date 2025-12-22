// apps/api/src/services/ai.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { jsonrepair } from 'jsonrepair';
import { config } from '../config';
import keyManager from '../utils/KeyManager';
import circuitBreaker from '../utils/CircuitBreaker';
import logger from '../utils/logger';
import { BasicAnalysisSchema, FullAnalysisSchema, NarrativeSchema } from '../utils/validation';
import { AppError } from '../utils/AppError';

// Types
type AIModelType = 'quality' | 'pro' | 'embedding';
type AnalysisMode = 'Full' | 'Basic';

const NEWS_SAFETY_SETTINGS = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
];

class AIService {
  
  /**
   * Helper: Clean text to save tokens and improve accuracy
   */
  private optimizeText(text: string, isPro: boolean = false): string {
    let clean = text.replace(/<[^>]*>/g, ' ') // Remove HTML
                    .replace(/\s+/g, ' ').trim();
    
    // Limits: Flash (700k chars), Pro (1.5M chars) - Keeping it safe
    const limit = isPro ? 1000000 : 500000;
    if (clean.length > limit) {
      return clean.substring(0, limit) + "...(truncated)";
    }
    return clean;
  }

  /**
   * Core Analysis Function
   */
  async analyzeArticle(text: string, headline: string, mode: AnalysisMode = 'Full') {
    const isHealthy = await circuitBreaker.isOpen('GEMINI');
    if (!isHealthy) return this.getFallbackAnalysis();

    const modelName = config.aiModels.quality; // Flash model for speed/cost

    try {
      // 1. Construct Prompt
      const schemaJson = mode === 'Basic' ? JSON.stringify(BasicAnalysisSchema) : JSON.stringify(FullAnalysisSchema);
      const prompt = `
        You are an expert news analyst. Analyze the following article.
        HEADLINE: ${headline}
        TEXT: ${this.optimizeText(text)}
        
        OUTPUT REQUIREMENT:
        Return ONLY valid JSON matching this schema:
        ${schemaJson}
      `;

      // 2. Execute with Key Rotation & Retry
      const result = await keyManager.executeWithRetry('GEMINI', async (apiKey) => {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          safetySettings: NEWS_SAFETY_SETTINGS as any,
          generationConfig: { responseMimeType: "application/json" }
        });

        const response = await model.generateContent(prompt);
        return response.response.text();
      });

      // 3. Parse & Validate
      const cleanJson = jsonrepair(result);
      const parsed = JSON.parse(cleanJson);
      
      if (mode === 'Basic') return BasicAnalysisSchema.parse(parsed);
      return FullAnalysisSchema.parse(parsed);

    } catch (error: any) {
      logger.error(`AI Analysis Failed: ${error.message}`);
      // Only record failure if it's not a validation error (i.e. if AI is down)
      if (!error.issues) {
        await circuitBreaker.recordFailure('GEMINI');
      }
      return this.getFallbackAnalysis();
    }
  }

  /**
   * Narrative Generation (Multi-doc synthesis)
   */
  async generateNarrative(articles: { source: string, headline: string, summary: string }[]) {
    if (articles.length < 2) return null;

    try {
      const prompt = `
        Synthesize a Master Narrative from these ${articles.length} sources.
        Focus on consensus facts vs divergence/spin.
        
        Sources:
        ${articles.map((a, i) => `[${i+1}] ${a.source}: ${a.headline} - ${a.summary}`).join('\n')}
      `;

      const result = await keyManager.executeWithRetry('GEMINI', async (apiKey) => {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
          model: config.aiModels.pro, // Use Pro for reasoning
          generationConfig: { responseMimeType: "application/json" }
        });
        const res = await model.generateContent(prompt);
        return res.response.text();
      });

      return NarrativeSchema.parse(JSON.parse(jsonrepair(result)));
    } catch (e) {
      logger.error('Narrative Gen Failed', e);
      return null;
    }
  }

  /**
   * Generate Embeddings for Vector Search
   */
  async createEmbedding(text: string): Promise<number[] | null> {
    try {
      const clean = this.optimizeText(text).substring(0, 9000); // Embedding limit
      
      const embedding = await keyManager.executeWithRetry('GEMINI', async (apiKey) => {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: config.aiModels.embedding });
        const res = await model.embedContent(clean);
        return res.embedding.values;
      });
      
      return embedding;
    } catch (e) {
      logger.error('Embedding Failed', e);
      return null;
    }
  }

  private getFallbackAnalysis() {
    return {
      summary: "Analysis currently unavailable.",
      category: "General",
      sentiment: "Neutral",
      politicalLean: "Not Applicable",
      biasScore: 0,
      trustLevel: "Unknown",
      keyFindings: []
    };
  }
}

export const aiService = new AIService();
