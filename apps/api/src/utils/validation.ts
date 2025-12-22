// apps/api/src/utils/validation.ts
import { z } from 'zod';

// 1. Basic Analysis (Fallback / Quick)
export const BasicAnalysisSchema = z.object({
  summary: z.string(),
  category: z.string(),
  sentiment: z.enum(['Positive', 'Negative', 'Neutral']),
});

// 2. Full Deep Analysis (Standard)
export const FullAnalysisSchema = z.object({
  summary: z.string(),
  category: z.string(),
  politicalLean: z.string(),
  sentiment: z.enum(['Positive', 'Negative', 'Neutral']),
  
  // Scores
  biasScore: z.number().min(0).max(100),
  biasLabel: z.string().optional(),
  credibilityScore: z.number().min(0).max(100),
  credibilityGrade: z.string().optional(),
  reliabilityScore: z.number().min(0).max(100),
  reliabilityGrade: z.string().optional(),
  trustLevel: z.string().optional(),
  
  // Metadata
  clusterTopic: z.string().optional(),
  country: z.string().optional(),
  primaryNoun: z.string().optional(),
  secondaryNoun: z.string().optional(),
  
  // Arrays
  keyFindings: z.array(z.string()),
  recommendations: z.array(z.string()).optional(),

  // Components (Strict nested validation)
  biasComponents: z.object({
    linguistic: z.object({ sentimentPolarity: z.number(), emotionalLanguage: z.number(), loadedTerms: z.number(), complexityBias: z.number() }),
    sourceSelection: z.object({ sourceDiversity: z.number(), expertBalance: z.number(), attributionTransparency: z.number() }),
    demographic: z.object({ genderBalance: z.number(), racialBalance: z.number(), ageRepresentation: z.number() }),
    framing: z.object({ headlineFraming: z.number(), storySelection: z.number(), omissionBias: z.number() })
  }),
  
  credibilityComponents: z.object({
    sourceCredibility: z.number(),
    factVerification: z.number(),
    professionalism: z.number(),
    evidenceQuality: z.number(),
    transparency: z.number(),
    audienceTrust: z.number()
  }),
  
  reliabilityComponents: z.object({
    consistency: z.number(),
    temporalStability: z.number(),
    qualityControl: z.number(),
    publicationStandards: z.number(),
    correctionsPolicy: z.number(),
    updateMaintenance: z.number()
  })
});

// 3. Narrative Synthesis (Cluster Summary)
export const NarrativeSchema = z.object({
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
