import { initTRPC, TRPCError } from '@trpc/server';
import { type Context } from './context';
import superjson from 'superjson';
import { ZodError } from 'zod';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * 1. Performance Logger
 * Tracks how long each request takes.
 */
const loggerMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;
  
  if (durationMs > 1000) {
      console.warn(`[SLOW] ${path} took ${durationMs}ms`);
  }
  
  return result;
});

/**
 * 2. Activity Recorder
 * Automatically logs key user actions to the database.
 * Replaces old Mongoose Middleware.
 */
const activityMiddleware = t.middleware(async ({ ctx, path, next, rawInput }) => {
  const result = await next();

  // Only log if user is authenticated and the call was successful
  if (result.ok && ctx.user) {
    try {
      // Map procedure names to ActionTypes
      let action: 'view_analysis' | 'view_comparison' | 'share_article' | null = null;
      let articleId: string | null = null; // Default to null for Prisma compliance

      // Extract article ID from input if present and valid
      if (rawInput && typeof rawInput === 'object' && 'id' in rawInput) {
           // @ts-ignore - We safely checked for 'id' above
           const extractedId = rawInput.id;
           if (typeof extractedId === 'string' && extractedId.length === 24) {
             articleId = extractedId;
           }
      }

      // Map paths to business logic actions
      if (path === 'article.getById') action = 'view_analysis';
      if (path === 'narrative.getClusterById') action = 'view_comparison';
      // Add more mappings as needed here

      if (action) {
        // Fire and forget (don't await) to keep response fast
        // FIX: articleId is now optional in schema, so we can safely pass null
        ctx.prisma.activityLog.create({
          data: {
            userId: ctx.user.uid,
            action,
            articleId: articleId, // Can be null now
            timestamp: new Date()
          }
        }).catch(err => console.error("Failed to log activity:", err));
      }
    } catch (e) {
      // Ignore logging errors to prevent blocking the main request
      console.error("Activity logging error:", e);
    }
  }

  return result;
});

export const router = t.router;
export const publicProcedure = t.procedure.use(loggerMiddleware);

// Protected procedures automatically log activity
export const protectedProcedure = t.procedure
  .use(loggerMiddleware)
  .use(activityMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });
