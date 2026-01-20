import admin from 'firebase-admin';
import { CONSTANTS } from './constants';
import logger from './logger';

// Prevent multiple initializations
if (!admin.apps.length) {
  try {
    // In production, use environment variables
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      // Local development fallback (ensure you have this set up or use mock)
      admin.initializeApp({
        projectId: "narrative-app-v1" // Replace with your actual project ID
      });
      logger.warn("⚠️ Firebase Admin initialized without Service Account (Dev Mode)");
    }
    logger.info("🔥 Firebase Admin Initialized");
  } catch (error: any) {
    logger.error(`Firebase Admin Init Error: ${error.message}`);
  }
}

export const firebaseAdmin = admin;
