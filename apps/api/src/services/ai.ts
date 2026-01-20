import KeyManager from '../utils/KeyManager';
import logger from '../utils/logger';
import { CONSTANTS } from '../utils/constants';
import CircuitBreaker from '../utils/CircuitBreaker';
import promptManager from '../utils/promptManager';
import AppError from '../utils/AppError';
import { jsonrepair } from 'jsonrepair';
import axios from 'axios';
import { BasicAnalysisSchema, FullAnalysisSchema } from '../utils/validation';

// Interfaces
interface IGeminiResponse {
  candidates?: {
    content: {
      parts: { text: string }[];
    };
  }[];
}

const NEWS_SAFETY_SETTINGS = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
];

const NARRATIVE_SCHEMA = {
  type: "OBJECT",
  properties: {
    masterHeadline: { type: "STRING" },
    executiveSummary: { type: "STRING" },
    consensusPoints: { type: "ARRAY", items: { type: "STRING" } },
    divergencePoints: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          point: { type: "STRING" },
          perspectives: {
             type: "ARRAY",
             items: {
                type: "OBJECT",
                properties: { source: { type: "STRING" }, stance: { type: "STRING" } },
                required: ["source", "stance"]
             }
          }
        },
        required: ["point", "perspectives"]
      }
    }
  },
  required: ["masterHeadline", "executiveSummary", "consensusPoints", "divergencePoints"]
};

// Helper to clean text
function cleanText(text: string): string {
    if (!text) return "";
    return text.replace(/<[^>]*>?/gm, "")
               .replace(/\r?\n|\r/g, " ")
               .replace(/\s+/g, " ")
               .trim();
}

const EMBEDDING_MODEL = "text-embedding-004";

class AIService {
  constructor() {
     // Initialization happens in index usually, but we ensure keys here if needed
     logger.info(`🤖 AI Service Initialized`);
  }

  // Optimize text context
  private optimizeTextForTokenLimits(text: string, isProMode: boolean = false): string {
      let clean = cleanText(text);

      const junkPhrases = [
          "Subscribe to continue reading", "Read more", "Sign up for our newsletter",
          "Follow us on", "© 2023", "© 2024", "© 2025", "All rights reserved",
          "Click here", "Advertisement", "Supported by", "Terms of Service"
      ];
      junkPhrases.forEach(phrase => {
          clean = clean.replace(new RegExp(phrase, 'gi'), '');
      });

      const SAFE_LIMIT = isProMode ? 1500000 : 800000;

      if (clean.length > SAFE_LIMIT) {
          logger.warn(`⚠️ Article extremely large. Truncating to ${SAFE_LIMIT}.`);
          return clean.substring(0, SAFE_LIMIT) + "\n\n[...Truncated...]";
      }
      return clean;
  }

  private smartTruncate(text: string, targetWordCount: number): string {
      if (!text) return "";
      const words = text.split(/\s+/);
      if (words.length <= targetWordCount + 10) return text;
      const truncated = words.slice(0, targetWordCount).join(' ');
      const lastDot = truncated.lastIndexOf('.');
      if (lastDot > targetWordCount * 0.5) return truncated.substring(0, lastDot + 1);
      return truncated + "...";
  }

  // --- 1. SINGLE ARTICLE ANALYSIS ---
  async analyzeArticle(article: any, targetModel: string = "gemini-2.0-flash-exp", mode: 'Full' | 'Basic' = 'Full'): Promise<any> {
    const isSystemHealthy = await CircuitBreaker.isOpen('GEMINI');
    if (!isSystemHealthy) {
        logger.warn('⚡ Circuit Breaker OPEN for Gemini. Using Fallback.');
        return this.getFallbackAnalysis(article);
    }

    const isPro = targetModel.includes('pro');
    const optimizedArticle = {
        ...article,
        summary: this.optimizeTextForTokenLimits(article.summary || article.content || "", isPro),
        headline: article.headline ? cleanText(article.headline) : ""
    };
    
    if (optimizedArticle.summary.length < 100) {
        return this.getFallbackAnalysis(article);
    }

    try {
        const prompt = await promptManager.getAnalysisPrompt(optimizedArticle, mode);
        
        const data = await KeyManager.executeWithRetry<IGeminiResponse>('GEMINI', async (apiKey) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
            const response = await axios.post<IGeminiResponse>(url, {
                contents: [{ parts: [{ text: prompt }] }],
                safetySettings: NEWS_SAFETY_SETTINGS, 
                generationConfig: {
                  responseMimeType: "application/json", 
                  // @ts-ignore
                  responseSchema: mode === 'Basic' ? BasicAnalysisSchema : FullAnalysisSchema,
                  temperature: 0.1, 
                  maxOutputTokens: 8192 
                }
            }, { timeout: 45000 });
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

  // --- 2. MULTI-DOCUMENT NARRATIVE ---
  async generateNarrative(articles: any[]): Promise<any> {
      if (!articles || articles.length < 2) return null;

      try {
          const targetModel = "gemini-1.5-pro"; // Force Quality

          let docContext = "";
          articles.forEach((art, index) => {
              docContext += `\n--- SOURCE ${index + 1}: ${art.source} ---\n`;
              docContext += `HEADLINE: ${art.headline}\n`;
              docContext += `TEXT: ${cleanText(art.summary || art.content || "")}\n`; 
          });

          const prompt = `
            You are an expert Chief Editor. Synthesize these reports.
            
            DOCUMENTS:
            ${docContext}
            
            OUTPUT:
            Master Narrative with Consensus and Divergence.
          `;

          const data = await KeyManager.executeWithRetry<IGeminiResponse>('GEMINI', async (apiKey) => {
              const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
              const response = await axios.post<IGeminiResponse>(url, {
                contents: [{ parts: [{ text: prompt }] }],
                safetySettings: NEWS_SAFETY_SETTINGS,
                generationConfig: {
                  responseMimeType: "application/json",
                  responseSchema: NARRATIVE_SCHEMA,
                  temperature: 0.2
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

  // --- 3. BATCH EMBEDDINGS ---
  async createBatchEmbeddings(texts: string[]): Promise<number[][] | null> {
    if (!texts.length) return [];
    try {
        const BATCH_SIZE = 100;
        const allEmbeddings: number[][] = new Array(texts.length).fill([]);
        const chunks: { text: string; index: number }[][] = [];

        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
             const chunk = texts.slice(i, i + BATCH_SIZE).map((text, idx) => ({
                 text: cleanText(text).substring(0, 3000), 
                 index: i + idx
             }));
             chunks.push(chunk);
        }

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
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (err: any) {
                logger.warn(`Partial Batch Failure: ${err.message}`);
            }
        }
        return allEmbeddings.filter(e => e.length > 0);
    } catch (error: any) {
        logger.error(`Batch Embedding Error: ${error.message}`);
        return null;
    }
  }

  // --- Private Helpers ---
  private parseGeminiResponse(data: IGeminiResponse, mode: 'Full' | 'Basic' | 'Narrative', originalArticle: any | null): any {
    try {
        const rawText = data.candidates?.[0]?.content.parts[0].text;
        if (!rawText) throw new AppError('AI returned empty content', 502);

        const cleanJson = jsonrepair(rawText);
        const parsedRaw = JSON.parse(cleanJson);

        if (mode === 'Narrative') return parsedRaw;

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
        if (mode === 'Full' && originalArticle) return this.getFallbackAnalysis(originalArticle);
        throw new AppError(`Failed to parse AI response: ${error.message}`, 502);
    }
  }

  private getFallbackAnalysis(article: any): any {
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
