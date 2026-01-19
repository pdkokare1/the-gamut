// apps/api/src/utils/promptManager.ts
import { prisma } from '@gamut/db';
import { PromptType } from '@prisma/client';
import redisHelper from './redis';
import { logger } from './logger';

// --- RICH DEFAULT PROMPTS (Strict Rules) ---

const AI_PERSONALITY = {
    LENGTH_INSTRUCTION: "Minimum 50 words and Maximum 60 words", 
    TONE: "Objective, authoritative, and direct (News Wire Style)",
    BIAS_STRICTNESS: "Strict. Flag subtle framing, omission, and emotional language.",
    // Specific words to avoid (Restored from old backend)
    FORBIDDEN_WORDS: "delves, underscores, crucial, tapestry, landscape, moreover, notably, the article, the report, the author, discusses, highlights, according to"
};

const STYLE_RULES = `
Style Guidelines:
- **DIRECT REPORTING:** Act as the primary source. Do NOT say "The article states" or "The report highlights." Just state the facts.
- **TITLE ACCURACY:** Use the EXACT titles found in the source text.
- Tone: ${AI_PERSONALITY.TONE}.
- **Length: ${AI_PERSONALITY.LENGTH_INSTRUCTION}.** If the source text is short, elaborate on the context to reach the minimum. If long, condense strictly to the maximum.
- Structure: Use short, punchy sentences suitable for audio reading.
- Grammar: Do NOT use hyphens (-), dashes (—), or colons (:) within sentences. Use periods or commas.
- Vocabulary: Do NOT use these words: ${AI_PERSONALITY.FORBIDDEN_WORDS}.
`;

const DEFAULT_ANALYSIS_PROMPT = `
Role: You are a Lead Editor for a global news wire.
Task: Analyze the following story and structure the data for our database.

Input Article:
Headline: "{{headline}}"
Description: "{{description}}"
Snippet: "{{content}}"
Date: {{date}}

--- INSTRUCTIONS ---

1. **Summarize (News Wire Style)**:
   ${STYLE_RULES}
   - Report the "Who, What, When, Where, Why" immediately.

2. **Categorize**:
   - Choose ONE: Politics, Business, Economy, Global Conflict, Tech, Science, Health, Justice, Sports, Entertainment, Lifestyle, Crypto & Finance, Gaming.

3. **CONDITIONAL BIAS & LEAN ANALYSIS (CRITICAL)**:
   - **IF Category is "Politics", "Economy", "Global Conflict", "Justice", "Policy", or "Social Issues":**
     - Political Lean: Left, Left-Leaning, Center, Right-Leaning, Right.
     - Bias Score (0-100): 0 = Neutral, 100 = Propaganda.
   - **IF Category is "Sports", "Entertainment", "Tech", "Science", "Lifestyle", "Gaming", or "Health":**
     - Political Lean: "Not Applicable".
     - Bias Score: 0.
     - Sentiment: "Neutral" (Unless it is clearly an opinion/review).

4. **Trust Score (0-100)**:
   - Based on source credibility and tone (applies to ALL categories).

5. **Smart Briefing**:
   - **Key Findings**: Extract exactly 5 distinct, bullet-point facts.
   - **Recommendations**: Provide 3 actionable tips (e.g., "Watch the match highlights", "Read the bill text").

6. **Extract Entities**:
   - Primary Noun: The main subject.
   - Secondary Noun: The context.

--- OUTPUT FORMAT ---
Respond ONLY in valid JSON. Do not add markdown blocks.

{
  "summary": "Direct, factual news brief.",
  "category": "CategoryString",
  "politicalLean": "Center",
  "analysisType": "Full",
  "sentiment": "Neutral",
  "clusterTopic": "Main Event Name",
  "country": "Global",
  "primaryNoun": "Subject",
  "secondaryNoun": "Context",
  "biasScore": 10, 
  "biasLabel": "Minimal Bias",
  "biasComponents": {
    "linguistic": {"sentimentPolarity": 0, "emotionalLanguage": 0, "loadedTerms": 0, "complexityBias": 0},
    "sourceSelection": {"sourceDiversity": 0, "expertBalance": 0, "attributionTransparency": 0},
    "demographic": {"genderBalance": 0, "racialBalance": 0, "ageRepresentation": 0},
    "framing": {"headlineFraming": 0, "storySelection": 0, "omissionBias": 0}
  },
  "credibilityScore": 90, "credibilityGrade": "A",
  "credibilityComponents": {"sourceCredibility": 0, "factVerification": 0, "professionalism": 0, "evidenceQuality": 0, "transparency": 0, "audienceTrust": 0},
  "reliabilityScore": 90, "reliabilityGrade": "A",
  "reliabilityComponents": {"consistency": 0, "temporalStability": 0, "qualityControl": 0, "publicationStandards": 0, "correctionsPolicy": 0, "updateMaintenance": 0},
  "trustLevel": "High",
  "keyFindings": ["Fact 1", "Fact 2", "Fact 3", "Fact 4", "Fact 5"],
  "recommendations": ["Tip 1", "Tip 2", "Tip 3"]
}`;

const SUMMARY_ONLY_PROMPT = `
Role: You are a News Curator.
Task: Summarize this story concisely.

Input Article:
Headline: "{{headline}}"
Description: "{{description}}"
Snippet: "{{content}}"

--- INSTRUCTIONS ---
1. Summarize: Provide a factual summary with **Minimum 50 words and Maximum 60 words**.
2. Categorize: Choose the most relevant category.
3. Sentiment: Determine if the story is Positive, Negative, or Neutral.

--- OUTPUT FORMAT ---
Respond ONLY in valid JSON:
{
  "summary": "String",
  "category": "String",
  "sentiment": "String",
  "politicalLean": "Not Applicable",
  "analysisType": "SentimentOnly"
}
`;

type ExtendedPromptType = PromptType | 'SUMMARY_ONLY';

class PromptManager {
    
    async getTemplate(type: ExtendedPromptType = PromptType.ANALYSIS): Promise<string> {
        if (type === 'SUMMARY_ONLY') return SUMMARY_ONLY_PROMPT;

        const CACHE_KEY = `PROMPT_${type}`;

        return await redisHelper.getOrFetch<string>(CACHE_KEY, async () => {
            try {
                const promptDoc = await prisma.prompt.findUnique({
                    where: { type: type as PromptType }
                });

                if (promptDoc && promptDoc.active) {
                    return promptDoc.text;
                }
            } catch (e: any) {
                logger.warn(`⚠️ Prompt DB Fetch failed: ${e.message}`);
            }
            
            return DEFAULT_ANALYSIS_PROMPT;
        }, 600); 
    }

    private interpolate(template: string, data: Record<string, string>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return data[key] !== undefined ? data[key] : match;
        });
    }

    public async getAnalysisPrompt(article: any, mode: 'Full' | 'Basic' = 'Full'): Promise<string> {
        const templateType: ExtendedPromptType = mode === 'Basic' ? 'SUMMARY_ONLY' : PromptType.ANALYSIS;
        
        const template = await this.getTemplate(templateType);
        
        const articleContent = article.summary || article.content || "";
        
        const data = {
            headline: article.headline || article.title || "No Title",
            description: article.description || "No Description",
            content: articleContent, 
            date: new Date().toISOString().split('T')[0]
        };

        return this.interpolate(template, data);
    }
}

export default new PromptManager();
