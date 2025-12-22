// apps/api/src/config.ts
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import * as admin from 'firebase-admin';
import Redis from 'ioredis';

dotenv.config();

// 1. Validation Helper
const getEnv = (key: string, required = true) => {
  const value = process.env[key];
  if (required && !value) throw new Error(`Missing Env Variable: ${key}`);
  return value || '';
};

// 2. Helper to parse list of keys (comma separated)
const getKeys = (keyName: string): string[] => {
  const val = process.env[keyName];
  if (!val) return [];
  return val.split(',').map(k => k.trim()).filter(k => k.length > 0);
};

// 3. Export Config
export const config = {
  port: parseInt(process.env.PORT || '3001'),
  env: process.env.NODE_ENV || 'development',
  databaseUrl: getEnv('DATABASE_URL'),
  redisUrl: getEnv('REDIS_URL'),
  
  firebase: {
    projectId: getEnv('FIREBASE_PROJECT_ID'),
    clientEmail: getEnv('FIREBASE_CLIENT_EMAIL'),
    privateKey: getEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  },
  
  cloudinary: {
    cloud_name: getEnv('CLOUDINARY_CLOUD_NAME'),
    api_key: getEnv('CLOUDINARY_API_KEY'),
    api_secret: getEnv('CLOUDINARY_API_SECRET'),
  },

  // Key Pools for Rotation
  keys: {
    // Falls back to single key if list not provided
    gemini: getKeys('GEMINI_KEYS').length > 0 ? getKeys('GEMINI_KEYS') : [getEnv('GEMINI_API_KEY', false)].filter(Boolean),
    newsApi: getKeys('NEWS_API_KEYS').length > 0 ? getKeys('NEWS_API_KEYS') : [getEnv('NEWS_API_KEY', false)].filter(Boolean),
    gnews: getKeys('GNEWS_KEYS').length > 0 ? getKeys('GNEWS_KEYS') : [getEnv('GNEWS_API_KEY', false)].filter(Boolean),
  },

  // AI Model Configs
  aiModels: {
    quality: 'gemini-2.5-flash', // Fast, good for general tasks
    pro: 'gemini-2.5-pro',       // High reasoning, for Narratives
    embedding: 'text-embedding-004' 
  },
  
  // Timeout settings
  timeouts: {
    externalApi: 25000
  }
};

// 4. Initialize Services
// Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(config.firebase),
  });
}
export const firebaseAdmin = admin;

// Cloudinary
cloudinary.config(config.cloudinary);
export const cloudinaryClient = cloudinary;

// Redis (Shared Instance for BullMQ & General Cache)
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false // Faster startup
});
