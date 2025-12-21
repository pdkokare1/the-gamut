import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import * as admin from 'firebase-admin';
import Redis from 'ioredis';

dotenv.config();

// 1. Validation
const getEnv = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing Env Variable: ${key}`);
  return value;
};

// 2. Export Config
export const config = {
  port: process.env.PORT || 3001,
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
  geminiKey: getEnv('GEMINI_API_KEY'), // For Gemini 2.5
};

// 3. Initialize Services
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

// Redis
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // Required for BullMQ
});
