import { GoogleGenerativeAI } from '@google/generative-ai';
import { jsonrepair } from 'jsonrepair';
import { config } from '../config';
import keyManager from '../utils/KeyManager';
import circuitBreaker from '../utils/CircuitBreaker';
import logger from '../utils/logger';
import { BasicAnalysisSchema, FullAnalysisSchema, NarrativeSchema } from '../utils/validation';

// Types
type AnalysisMode = 'Full' | 'Basic';

const NEWS_SAFETY_SETTINGS = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
];

class AIService {
  
  /**
   * Optimized Cleaner: Removes specific news junk to save tokens.
   */
  private optimizeText(text: string, isPro: boolean = false): string {
    let clean = text.replace(/<[^>]*>/g, ' '); // HTML
    
    // Remove common news clutter
    const junkPhrases = [
        "Subscribe to continue reading", "Read more", "Sign up for our newsletter",
        "Follow us on", "© 2024", "All rights reserved", "Click here", 
        "Advertisement", "Supported by"
    ];
    junkPhrases.forEach(phrase => {
        clean = clean.replace(new RegExp(phrase, 'gi'), '');
    });

    clean = clean.replace(/\s+/g, ' ').trim();
    
    // Limits: Flash (700k chars), Pro (1.5M chars)
    const limit = isPro ? 1000000 : 700000;
    if (clean.length > limit) {
      return clean.substring(0, limit) + "...(truncated)";
    }
    return clean;
  }

  /**
   * Core Analysis Function
   */
  async analyzeArticle(text: string, headline: string, mode: AnalysisMode = 'Full') {
    if (await circuitBreaker.isOpen('GEMINI')) return this.getFallbackAnalysis();

    const modelName = config.aiModels.quality; 

    try {
      const schemaJson = mode === 'Basic' ? JSON.stringify(BasicAnalysisSchema) : JSON.stringify(FullAnalysisSchema);
      const cleanText = this.optimizeText(text);

      const prompt = `
        You are an expert news analyst. Analyze the following article.
        HEADLINE: ${headline}
        TEXT: ${cleanText}
        
        OUTPUT REQUIREMENT:
        Return ONLY valid JSON matching this schema:
        ${schemaJson}
      `;

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

      const cleanJson = jsonrepair(result);
      const parsed = JSON.parse(cleanJson);
      
      if (mode === 'Basic') return BasicAnalysisSchema.parse(parsed);
      return FullAnalysisSchema.parse(parsed);

    } catch (error: any) {
      logger.error(`AI Analysis Failed: ${error.message}`);
      if (!error.issues) { // Only record failure if it's NOT a Zod validation error
        await circuitBreaker.recordFailure('GEMINI');
      }
      return this.getFallbackAnalysis();
    }
  }

  /**
   * Narrative Generation
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
          model: config.aiModels.pro, 
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
   * Single Embedding
   */
  async createEmbedding(text: string): Promise<number[] | null> {
    try {
      const clean = this.optimizeText(text).substring(0, 9000);
      
      return await keyManager.executeWithRetry('GEMINI', async (apiKey) => {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: config.aiModels.embedding });
        const res = await model.embedContent(clean);
        return res.embedding.values;
      });
    } catch (e) {
      logger.error('Embedding Failed', e);
      return null;
    }
  }

  /**
   * Batch Embedding (Restored Feature)
   * Essential for bulk-processing articles for vector search.
   */
  async createBatchEmbeddings(texts: string[]): Promise<number[][] | null> {
    if (!texts.length) return [];
    if (await circuitBreaker.isOpen('GEMINI')) return null;

    try {
        const BATCH_SIZE = 50; // Gemini limit per request is often 100, playing safe
        const allEmbeddings: number[][] = [];

        // Process in chunks
        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
             const chunk = texts.slice(i, i + BATCH_SIZE);
             
             // We can't use the standard SDK for batching easily in all versions, 
             // but we can map parallel promises with concurrency control if needed.
             // For simplicity and reliability in this stack, we'll map them:
             const chunkPromises = chunk.map(text => this.createEmbedding(text));
             const chunkResults = await Promise.all(chunkPromises);
             
             chunkResults.forEach(res => {
                 if (res) allEmbeddings.push(res);
                 else allEmbeddings.push([]); // Keep index alignment
             });
        }
        return allEmbeddings;
    } catch (error) {
        logger.error('Batch Embedding Failed', error);
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
      trustScore: 0,
      trustLevel: "Unknown",
      keyFindings: []
    };
  }
}

export const aiService = new AIService();
