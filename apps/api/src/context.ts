import { inferAsyncReturnType } from '@trpc/server';
import { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { prisma } from '@gamut/db';
import { firebaseAdmin } from './config';

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  // 1. Extract Token
  const authHeader = req.headers.authorization;
  let user = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      // 2. Verify with Firebase
      const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
      user = decodedToken;
    } catch (err) {
      // Invalid token, but we don't throw yet (allows public routes)
      console.warn("Auth check failed:", err);
    }
  }

  // 3. Return Context
  return {
    req,
    res,
    prisma, // Type-safe DB Access
    user,   // The Logged in User (or null)
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;
