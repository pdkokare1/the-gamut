// apps/api/src/utils/constants.ts

// Preserved from old narrative-backend/utils/constants.ts
export const TRUSTED_SOURCES = [
  'Reuters', 
  'AP', 
  'BBC', 
  'NPR', 
  'PBS', 
  'Bloomberg', 
  'WSJ', 
  'The Guardian', 
  'Financial Times'
];

// Preserved from old narrative-backend/utils/constants.ts (The "Trap" Filter)
export const JUNK_KEYWORDS = [
  'horoscope', 
  'deal of the day', 
  'best seller', 
  'gift guide', 
  'coupon', 
  'lottery', 
  'sex', 
  'dating', 
  'casino',
  'click here',
  'subscribe now'
];

// System defaults
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 100;
export const ANALYSIS_VERSION = '3.6';
