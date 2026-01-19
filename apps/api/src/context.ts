// apps/api/src/context.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { inferAsyncReturnType } from '@trpc/server';
import { prisma } from '@gamut/db'; // Your shared DB package
import { redis } from './utils/redis';
import admin from 'firebase-admin';
import { logger } from './utils/logger';

// Ensure Firebase is initialized (Single instance check)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
        // Ensure these env vars are set in your Railway project
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
    logger.info("🔥 Firebase Admin Initialized");
  } catch (error) {
    logger.error("❌ Firebase Admin Init Failed: ", error);
  }
}

export async function createContext({ req, res }: { req: FastifyRequest; res: FastifyReply }) {
  let userId: string | null = null;
  let userEmail: string | null = null;

  try {
    // 1. Check for Authorization Header
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      // 2. Verify Token with Firebase
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      if (decodedToken) {
         // Map Firebase UID to your internal User ID if needed, 
         // or use Firebase UID directly as the primary key.
         userId = decodedToken.uid;
         userEmail = decodedToken.email || null;
      }
    }
  } catch (err) {
    // Token invalid or expired - we don't throw here, just leave user as null
    // Protected procedures will throw the error.
    // logger.debug("Auth Token Verification Failed", err); 
  }

  return {
    req,
    res,
    prisma,
    redis,
    user: userId ? { id: userId, email: userEmail } : null,
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;
