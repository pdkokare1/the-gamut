// apps/api/src/services/ai.ts
import axios from 'axios';
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';
import KeyManager from '../utils/KeyManager';
import CircuitBreaker from '../utils/CircuitBreaker';
import logger from '../utils/logger';
import config from '../config'; 
import AppError from '../utils/AppError';
import { CONSTANTS } from '../utils/constants';
import promptManager from '../utils/promptManager';

// --- TYPES & INTERFACES ---
export interface IArticle {
  headline: string;
  summary: string;
  content?: string;
  source: string;
  [key: string]: any;
}

export interface IGeminiResponse {
  candidates?: {
    content: {
      parts: { text: string }[];
    };
  }[];
}

// --- VALIDATION SCHEMAS (Zod) ---
const BasicAnalysisSchema = z.object({
  summary: z.string(),
  category: z.string(),
  sentiment: z.enum(["Positive", "Negative", "Neutral"]),
});

const FullAnalysisSchema = z.object({
  summary: z.string(),
  category: z.string(),
  politicalLean: z.string(),
  sentiment: z.enum(["Positive", "Negative", "Neutral"]),
  biasScore: z.number(),
  biasLabel: z.string().optional(),
  credibilityScore: z.number(),
  credibilityGrade: z.string().optional(),
  reliabilityScore: z.number(),
  reliabilityGrade: z.string().optional(),
  trustLevel: z.string(),
  clusterTopic: z.string().optional(),
  country: z.string().optional(),
  primaryNoun: z.string().optional(),
  secondaryNoun: z.string().optional(),
  keyFindings: z.array(z.string()),
  recommendations: z.array(z.string()).optional(),
  biasComponents: z.object({
    linguistic: z.object({
      sentimentPolarity: z.number(),
      emotionalLanguage: z.number(),
      loadedTerms: z.number(),
      complexityBias: z.number(),
    }),
    sourceSelection: z.object({
      sourceDiversity: z.number(),
      expertBalance: z.number(),
      attributionTransparency: z.number(),
    }),
    demographic: z.object({
      genderBalance: z.number(),
      racialBalance: z.number(),
      ageRepresentation: z.number(),
    }),
    framing: z.object({
      headlineFraming: z.number(),
      storySelection: z.number(),
      omissionBias: z.number(),
    }),
  }),
  credibilityComponents: z.object({
    sourceCredibility: z.number(),
    factVerification: z.number(),
    professionalism: z.number(),
    evidenceQuality: z.number(),
    transparency: z.number(),
    audienceTrust: z.number(),
  }),
  reliabilityComponents: z.object({
    consistency: z.number(),
    temporalStability: z.number(),
    qualityControl: z.number(),
    publicationStandards: z.number(),
    correctionsPolicy: z.number(),
    updateMaintenance: z.number(),
  }),
});

// --- CONSTANTS ---
const EMBEDDING_MODEL = "text-embedding-004";
const NEWS_SAFETY_SETTINGS = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
];

class AIService {
  constructor() {
    if (config.keys?.gemini && config.keys.gemini.length > 0) {
        KeyManager.registerProviderKeys('GEMINI', config.keys.gemini);
    } else {
        logger.warn("⚠️ No Gemini API Key found in config");
    }
    logger.info(`🤖 AI Service Initialized`);
  }

  // --- HELPER: Clean Text ---
  private cleanText(text: string): string {
    if (!text) return "";
    return text.replace(/\s+/g, ' ').trim();
  }

  // --- HELPER: Smart Truncation ---
  private smartTruncate(text: string, targetWordCount: number): string {
      if (!text) return "";
      const words = text.split(/\s+/);
      if (words.length <= targetWordCount + 10) return text;

      const truncated = words.slice(0, targetWordCount).join(' ');
      const lastDot = truncated.lastIndexOf('.');
      if (lastDot > targetWordCount * 0.5) {
          return truncated.substring(0, lastDot + 1);
      }
      return truncated + "...";
  }

  private optimizeTextForTokenLimits(text: string, isProMode: boolean = false): string {
      let clean = this.cleanText(text);
      const junkPhrases = ["Subscribe to continue reading", "Read more", "Sign up", "Advertisement"];
      junkPhrases.forEach(phrase => {
          clean = clean.replace(new RegExp(phrase, 'gi'), '');
      });

      const SAFE_LIMIT = isProMode ? 1500000 : 800000;
      if (clean.length > SAFE_LIMIT) {
          return clean.substring(0, SAFE_LIMIT) + "\n\n[...Truncated...]";
      }
      return clean;
  }

  /**
   * --- 1. SINGLE ARTICLE ANALYSIS ---
   */
  async analyzeArticle(article: Partial<IArticle>, targetModel: string = "gemini-1.5-flash", mode: 'Full' | 'Basic' = 'Full'): Promise<any> {
    const isSystemHealthy = await CircuitBreaker.isOpen('GEMINI');
    if (!isSystemHealthy) return this.getFallbackAnalysis(article);

    const isPro = targetModel.includes('pro');
    const optimizedArticle = {
        ...article,
        summary: this.optimizeTextForTokenLimits(article.summary || article.content || "", isPro),
        headline: article.headline ? this.cleanText(article.headline) : ""
    };
    
    if (optimizedArticle.summary.length < 50) return this.getFallbackAnalysis(article);

    try {
        const prompt = await promptManager.getAnalysisPrompt(optimizedArticle, mode);
        
        const data = await KeyManager.executeWithRetry<IGeminiResponse>('GEMINI', async (apiKey) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
            const response = await axios.post<IGeminiResponse>(url, {
                contents: [{ parts: [{ text: prompt }] }],
                safetySettings: NEWS_SAFETY_SETTINGS, 
                generationConfig: {
                  responseMimeType: "application/json", 
                  temperature: 0.1, 
                  maxOutputTokens: 8192 
                }
            }, { timeout: 60000 });
            return response.data;
        });

        await CircuitBreaker.recordSuccess('GEMINI');
        return this.parseGeminiResponse(data, mode, article);

    } catch (error: any) {
      await CircuitBreaker.recordFailure('GEMINI');
      logger.error(`AI Analysis Failed: ${error.message}`);
      return this.getFallbackAnalysis(article);
    }
  }

  /**
   * --- 2. MULTI-DOCUMENT NARRATIVE SYNTHESIS ---
   */
  async generateNarrative(articles: IArticle[]): Promise<any> {
      if (!articles || articles.length < 2) return null;

      try {
          const targetModel = "gemini-1.5-pro"; // Force Pro for synthesis
          let docContext = articles.map((art, i) => 
            `\n--- SOURCE ${i + 1}: ${art.source} ---\nHEADLINE: ${art.headline}\nTEXT: ${this.cleanText(art.summary)}\n`
          ).join('');

          const prompt = `
            You are an expert Chief Editor. Synthesize a "Master Narrative" from these ${articles.length} reports.
            OUTPUT JSON: { masterHeadline, executiveSummary, consensusPoints: [], divergencePoints: [{ point, perspectives: [{source, stance}] }] }
            DOCUMENTS: ${docContext}
          `;

          const data = await KeyManager.executeWithRetry<IGeminiResponse>('GEMINI', async (apiKey) => {
              const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
              const response = await axios.post<IGeminiResponse>(url, {
                contents: [{ parts: [{ text: prompt }] }],
                safetySettings: NEWS_SAFETY_SETTINGS,
                generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
              }, { timeout: 120000 }); 
              return response.data;
          });
          
          return this.parseGeminiResponse(data, 'Narrative', null);

      } catch (error: any) {
          logger.error(`Narrative Generation Failed: ${error.message}`);
          return null;
      }
  }

  /**
   * --- 3. BATCH EMBEDDINGS ---
   */
  async createBatchEmbeddings(texts: string[]): Promise<number[][] | null> {
    if (await CircuitBreaker.isOpen('GEMINI') === false) return null;
    if (!texts.length) return [];

    try {
        const BATCH_SIZE = 100;
        const allEmbeddings: number[][] = new Array(texts.length).fill([]);
        const chunks = [];

        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
             chunks.push(texts.slice(i, i + BATCH_SIZE).map((text, idx) => ({
                 text: this.cleanText(text).substring(0, 3000), 
                 index: i + idx
             })));
        }

        // Sequential processing
        for (const chunk of chunks) {
            const requests = chunk.map(item => ({
                model: `models/${EMBEDDING_MODEL}`,
                content: { parts: [{ text: item.text }] }
            }));

            try {
                await KeyManager.executeWithRetry('GEMINI', async (apiKey) => {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`;
                    const response = await axios.post<{ embeddings?: { values: number[] }[] }>(url, { requests }, { timeout: 45000 });
                    
                    if (response.data.embeddings) {
                        response.data.embeddings.forEach((emb, localIdx) => {
                            allEmbeddings[chunk[localIdx].index] = emb.values;
                        });
                    }
                    return response.data;
                });
                await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit pause

            } catch (err: any) {
                logger.warn(`Partial Batch Failure: ${err.message}`);
            }
        }

        await CircuitBreaker.recordSuccess('GEMINI');
        return allEmbeddings.filter(e => e.length > 0);

    } catch (error: any) {
        logger.error(`Batch Embedding Error: ${error.message}`);
        return null;
    }
  }

  // --- HELPERS ---
  private parseGeminiResponse(data: IGeminiResponse, mode: 'Full' | 'Basic' | 'Narrative', originalArticle: Partial<IArticle> | null): any {
    try {
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new AppError('AI returned empty content', 502);

        const cleanJson = jsonrepair(rawText);
        const parsedRaw = JSON.parse(cleanJson);

        if (mode === 'Narrative') return parsedRaw;

        if (mode === 'Basic') {
            const validated = BasicAnalysisSchema.parse(parsedRaw);
            return { ...validated, analysisType: 'SentimentOnly', biasScore: 0, trustScore: 0 };
        } else {
            const validated = FullAnalysisSchema.parse(parsedRaw);
            const trustScore = Math.round(Math.sqrt(validated.credibilityScore * validated.reliabilityScore));
            return { ...validated, analysisType: 'Full', trustScore };
        }
    } catch (error: any) {
        logger.error(`AI Parse Error: ${error.message}`);
        if (mode === 'Full' && originalArticle) return this.getFallbackAnalysis(originalArticle);
        throw new AppError(`Failed to parse AI response`, 502);
    }
  }

  private getFallbackAnalysis(article: Partial<IArticle>): Partial<IArticle> {
      const rawSummary = article.summary || article.content || "Analysis unavailable";
      return {
          summary: this.smartTruncate(rawSummary, 60),
          category: "Uncategorized",
          politicalLean: "Not Applicable",
          biasScore: 0,
          trustScore: 0,
          analysisType: 'SentimentOnly',
          sentiment: 'Neutral'
      };
  }
}

export default new AIService();
