// apps/api/src/utils/constants.ts
import config from '../config';

export const ONE_MINUTE = 60 * 1000;
export const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const CONSTANTS = {
  // Error Codes
  ERROR_CODES: {
    AUTH_NO_APP_CHECK: 'AUTH_NO_APP_CHECK',
    AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
    AUTH_MISSING_TOKEN: 'AUTH_MISSING_TOKEN',
    ACCESS_DENIED: 'ACCESS_DENIED',
  },

  // AI Configuration (Gemini 2.5 Series - Updated per User Request)
  AI_MODELS: {
    FAST: 'gemini-2.5-flash',      // High speed, low cost
    QUALITY: 'gemini-2.5-pro',     // Deep reasoning, narrative synthesis
    EMBEDDING: 'text-embedding-004' // Standard embedding model
  },

  // Cost & Safety Controls
  AI_LIMITS: {
    MIN_CONTENT_CHARS: 100,
    MAX_TOKENS_FLASH: 1000000,
    MAX_TOKENS_PRO: 2000000,
    MAX_INPUT_CHARS: 300000, 
  },

  // Timeouts (Standardized)
  TIMEOUTS: {
    EXTERNAL_API: 60000,   // 60s
    AI_GENERATION: 90000,  // 90s
    NARRATIVE_GEN: 120000, // 2 mins
  },

  // Cache Settings
  CACHE_TTL: {
    PROMPT: 600,   // 10 mins
    ARTICLE: 3600, // 1 hour
    FEED: 300,     // 5 mins
  },

  // News Fetching & Processing
  NEWS: {
    BATCH_SIZE: 10,
    FETCH_LIMIT: 20,       // Max articles to fetch per source
    SEMANTIC_AGE_HOURS: 24, // If a similar article is older than this, re-analyze it
  },

  // Redis Keys (Centralized to prevent typos)
  REDIS_KEYS: {
    NEWS_CYCLE: 'SYSTEM:NEWS_CYCLE_INDEX',
    NEWS_SEEN_PREFIX: 'NEWS:SEEN:',
    BANNED_DOMAINS: 'GATEKEEPER:BANNED_DOMAINS',
    GATEKEEPER_CACHE: 'GATEKEEPER_DECISION_V5_',
    TRENDING: 'trending_topics_smart',
  }
} as const;

// --- NEWS FETCH CYCLES ---
export const FETCH_CYCLES = [
    { name: 'Cycle A: General & World', params: { topic: 'breaking-news' } },
    { name: 'Cycle B: Technology & Science', params: { topic: 'technology' } },
    { name: 'Cycle C: Business & Economy', params: { topic: 'business' } },
    { name: 'Cycle D: Nation (India)', params: { country: 'in' } }, 
    { name: 'Cycle E: Entertainment', params: { topic: 'entertainment' } }
];

// --- TRUSTED SOURCES (VIP List) ---
export const TRUSTED_SOURCES = [
    // Global Wires
    'reuters', 'associated press', 'bloomberg', 'bbc', 'al jazeera', 'deutsche welle',
    // Financial/Policy
    'the wall street journal', 'financial times', 'the economist', 'npr', 'pbs',
    // India "Hard News"
    'the indian express', 'the hindu', 'livemint', 'ndtv', 'business standard',
    'the print', 'scroll.in', 'ani news', 'deccan herald', 'the tribune'
];

// --- JUNK KEYWORDS (The "Trap") ---
// Critical for filtering out non-news content before AI processing
export const JUNK_KEYWORDS = [
    // Lifestyle Blacklist
    'dating', 'relationship advice', 'tips for', 'diet', 'weight loss', 
    'workout', 'fashion', 'beauty', 'outfit', 'skin care', 'hairstyle', 
    'makeup', 'gift idea',
    // Shopping & Deals
    'coupon', 'promo code', 'discount', 'deal of the day', 'price drop', 
    'shopping', 'gift guide', 'best buy', 'amazon prime', 'black friday', 
    'sale', 'affiliate link',
    // Gaming Guides
    'wordle', 'connections hint', 'connections answer', 'crossword', 'sudoku', 
    'walkthrough', 'guide', 'today\'s answer', 'patch notes', 'loadout', 
    'tier list', 'how to get', 'where to find', 'twitch drops', 'codes for',
    // Fluff
    'horoscope', 'zodiac', 'astrology', 'tarot', 'psychic', 'manifesting',
    'celeb look', 'red carpet', 'net worth',
    // Gambling
    'powerball', 'mega millions', 'lottery results', 'winning numbers', 
    'betting odds', 'prediction', 'parlay', 'gambling',
];
