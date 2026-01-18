// apps/api/src/utils/constants.ts

export const CONSTANTS = {
  AI_MODELS: {
    FAST: 'gemini-1.5-flash',
    QUALITY: 'gemini-1.5-pro',
    EMBEDDING: 'text-embedding-004'
  },
  AI_LIMITS: {
    MIN_CONTENT_CHARS: 100,
    MAX_TOKENS_FLASH: 1000000,
    MAX_TOKENS_PRO: 2000000
  },
  TIMEOUTS: {
    EXTERNAL_API: 60000, // 60s
    AI_GENERATION: 90000, // 90s
    NARRATIVE_GEN: 120000 // 2 mins
  },
  CACHE_TTL: {
    PROMPT: 600, // 10 mins
    ARTICLE: 3600 // 1 hour
  }
} as const;
