import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';
import { logger } from '../utils/logger'; 
import KeyManager from '../utils/KeyManager';
import apiClient from '../utils/apiClient'; 
import config from '../config'; 
import AppError from '../utils/AppError';
import CircuitBreaker from '../utils/CircuitBreaker';
import promptManager from '../utils/promptManager';
import { CONSTANTS } from '../utils/constants'; 

// --- Validation Schemas (Zod) ---
// These strictly match your old validationSchemas.ts but using Zod for runtime safety
const BasicAnalysisSchema = z.object({
  summary: z.string(),
  category: z.string(),
  sentiment: z.enum(["Positive", "Negative", "Neutral"])
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
  recommendations: z.array(z.string()),
  
  biasComponents: z.object({
    linguistic: z.object({ sentimentPolarity: z.number(), emotionalLanguage: z.number(), loadedTerms: z.number(), complexityBias: z.number() }),
    sourceSelection: z.object({ sourceDiversity: z.number(), expertBalance: z.number(), attributionTransparency: z.number() }),
    demographic: z.object({ genderBalance: z.number(), racialBalance: z.number(), ageRepresentation: z.number() }),
    framing: z.object({ headlineFraming: z.number(), storySelection: z.number(), omissionBias: z.number() })
  }).optional(),
  
  credibilityComponents: z.object({
    sourceCredibility: z.number(),
    factVerification: z.number(),
    professionalism: z.number(),
    evidenceQuality: z.number(),
    transparency: z.number(),
    audienceTrust: z.number()
  }).optional(),

  reliabilityComponents: z.object({
    consistency: z.number(),
    temporalStability: z.number(),
    qualityControl: z.number(),
    publicationStandards: z.number(),
    correctionsPolicy: z.number(),
    updateMaintenance: z.number()
  }).optional()
});

const NarrativeSchema = z.object({
    masterHeadline: z.string(),
    executiveSummary: z.string(),
    consensusPoints: z.array(z.string()),
    divergencePoints: z.array(z.object({
        point: z.string(),
        perspectives: z.array(z.object({
            source: z.string(),
            stance: z.string()
        }))
    }))
});

// --- Constants ---
const EMBEDDING_MODEL = CONSTANTS.AI_MODELS?.EMBEDDING || "text-embedding-004";
const NEWS_SAFETY_SETTINGS = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
];

class AIService {
  constructor() {
    // Initialize Keys from new config structure
    if (config.keys?.gemini && config.keys.gemini.length > 0) {
        KeyManager.registerProviderKeys('GEMINI', config.keys.gemini);
    } else {
        logger.warn("⚠️ No Gemini API Key found in config");
    }
    logger.info(`🤖 AI Service Initialized (Default: ${CONSTANTS.AI_MODELS?.FAST || 'gemini-1.5-flash'})`);
  }

  // --- Helpers ---

  private cleanText(text: string): string {
    if (!text) return "";
    return text.replace(/\s+/g, ' ').trim();
  }

  private optimizeTextForTokenLimits(text: string, isProMode: boolean = false): string {
      let clean = this.cleanText(text);

      const junkPhrases = [
          "Subscribe to continue reading", "Read more", "Sign up for our newsletter",
          "Follow us on", "© 2023", "© 2024", "© 2025", "All rights reserved",
          "Click here", "Advertisement", "Supported by", "Terms of Service"
      ];
      junkPhrases.forEach(phrase => {
          clean = clean.replace(new RegExp(phrase, 'gi'), '');
      });

      // Limits: Pro = 1.5M, Flash = 800k (Safe margins)
      const SAFE_LIMIT = isProMode ? 1500000 : 800000;

      if (clean.length > SAFE_LIMIT) {
          logger.warn(`⚠️ Article extremely large (${clean.length} chars). Truncating to ${SAFE_LIMIT}.`);
          return clean.substring(0, SAFE_LIMIT) + "\n\n[...Truncated due to extreme length...]";
      }

      return clean;
  }

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

  // --- Core Methods ---

  async analyzeArticle(article: any, targetModel: string = CONSTANTS.AI_MODELS?.FAST || 'gemini-1.5-flash', mode: 'Full' | 'Basic' = 'Full'): Promise<any> {
    const isSystemHealthy = await CircuitBreaker.isOpen('GEMINI');
    if (!isSystemHealthy) {
        logger.warn('⚡ Circuit Breaker OPEN for Gemini. Using Fallback.');
        return this.getFallbackAnalysis(article);
    }

    const isPro = targetModel.includes('pro');
    const optimizedArticle = {
        ...article,
        summary: this.optimizeTextForTokenLimits(article.summary || article.content || "", isPro),
        headline: article.headline ? this.cleanText(article.headline) : ""
    };
    
    // Safety check for empty content
    if (!optimizedArticle.summary || optimizedArticle.summary.length < 50) {
        return this.getFallbackAnalysis(article);
    }

    try {
        const prompt = await promptManager.getAnalysisPrompt(optimizedArticle, mode);
        
        const data = await KeyManager.executeWithRetry<any>('GEMINI', async (apiKey) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
            const response = await apiClient.post<any>(url, {
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

  async generateNarrative(articles: any[]): Promise<any> {
      if (!articles || articles.length < 2) return null;

      try {
          const targetModel = CONSTANTS.AI_MODELS?.QUALITY || 'gemini-1.5-pro';

          let docContext = "";
          articles.forEach((art, index) => {
              docContext += `\n--- SOURCE ${index + 1}: ${art.source} ---\n`;
              docContext += `HEADLINE: ${art.headline}\n`;
              docContext += `TEXT: ${this.cleanText(art.summary)}\n`; 
          });

          const prompt = `
            You are an expert Chief Editor and Narrative Analyst.
            Analyze the following ${articles.length} news reports on the same event.
            Synthesize a "Master Narrative" highlighting consensus and divergence.
            
            OUTPUT JSON format matching schema: masterHeadline, executiveSummary, consensusPoints (string[]), divergencePoints ({point, perspectives: {source, stance}[]}).
            
            DOCUMENTS:
            ${docContext}
          `;

          const data = await KeyManager.executeWithRetry<any>('GEMINI', async (apiKey) => {
              const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
              const response = await apiClient.post<any>(url, {
                contents: [{ parts: [{ text: prompt }] }],
                safetySettings: NEWS_SAFETY_SETTINGS,
                generationConfig: {
                  responseMimeType: "application/json",
                  temperature: 0.2, 
                  maxOutputTokens: 8192
                }
              }, { timeout: 120000 }); 
              return response.data;
          });
          
          if (!data.candidates || data.candidates.length === 0) return null;
          return this.parseGeminiResponse(data, 'Narrative', null);

      } catch (error: any) {
          logger.error(`Narrative Generation Failed: ${error.message}`);
          return null;
      }
  }

  async createBatchEmbeddings(texts: string[]): Promise<number[][] | null> {
    const isSystemHealthy = await CircuitBreaker.isOpen('GEMINI');
    if (!isSystemHealthy) return null;
    if (!texts.length) return [];

    try {
        const BATCH_SIZE = 100;
        const allEmbeddings: number[][] = new Array(texts.length).fill([]);
        const chunks: { text: string; index: number }[][] = [];

        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
             const chunk = texts.slice(i, i + BATCH_SIZE).map((text, idx) => ({
                 text: this.cleanText(text).substring(0, 3000), 
                 index: i + idx
             }));
             chunks.push(chunk);
        }

        // Sequential processing to avoid rate limits
        for (const chunk of chunks) {
            const requests = chunk.map(item => ({
                model: `models/${EMBEDDING_MODEL}`,
                content: { parts: [{ text: item.text }] }
            }));

            try {
                await KeyManager.executeWithRetry('GEMINI', async (apiKey) => {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`;
                    const response = await apiClient.post<{ embeddings?: { values: number[] }[] }>(url, { requests }, { timeout: 45000 });
                    
                    if (response.data.embeddings) {
                        response.data.embeddings.forEach((emb, localIdx) => {
                            const originalIndex = chunk[localIdx].index;
                            allEmbeddings[originalIndex] = emb.values;
                        });
                    }
                    return response.data;
                });
                await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit buffer

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

  async createEmbedding(text: string): Promise<number[] | null> {
    try {
        const clean = this.cleanText(text).substring(0, 3000);
        
        const responseData = await KeyManager.executeWithRetry<{ embedding: { values: number[] } }>('GEMINI', async (apiKey) => {
             const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
             const res = await apiClient.post(url, {
                model: `models/${EMBEDDING_MODEL}`,
                content: { parts: [{ text: clean }] }
             }, { timeout: 10000 });
             return res.data;
        });

        return responseData.embedding.values;
    } catch (error: any) {
        logger.error(`Embedding Error: ${error.message}`);
        return null; 
    }
  }

  // --- Parsing & Fallback ---

  private parseGeminiResponse(data: any, mode: string, originalArticle: any | null): any {
    try {
        if (!data.candidates || data.candidates.length === 0) throw new AppError('AI returned no candidates', 502);
        
        const rawText = data.candidates[0].content.parts[0].text;
        if (!rawText) throw new AppError('AI returned empty content', 502);

        const cleanJson = jsonrepair(rawText);
        const parsedRaw = JSON.parse(cleanJson);

        if (mode === 'Narrative') {
            return NarrativeSchema.parse(parsedRaw); 
        }

        let validated;
        if (mode === 'Basic') {
            validated = BasicAnalysisSchema.parse(parsedRaw);
            return {
                ...validated,
                politicalLean: 'Not Applicable',
                analysisType: 'SentimentOnly',
                biasScore: 0, credibilityScore: 0, reliabilityScore: 0, trustScore: 0
            };
        } else {
            validated = FullAnalysisSchema.parse(parsedRaw);
            const trustScore = Math.round(Math.sqrt(validated.credibilityScore * validated.reliabilityScore));
            return { ...validated, analysisType: 'Full', trustScore };
        }

    } catch (error: any) {
        logger.error(`AI Parse/Validation Error: ${error.message}`);
        if (mode === 'Full' && originalArticle) {
             logger.warn("Attempting Basic Fallback due to parsing error...");
             return this.getFallbackAnalysis(originalArticle);
        }
        throw new AppError(`Failed to parse AI response: ${error.message}`, 502);
    }
  }

  private getFallbackAnalysis(article: any): any {
      const rawSummary = article.summary || article.content || "Analysis unavailable (System Error)";
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
