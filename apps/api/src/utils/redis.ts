// apps/api/src/utils/redis.ts
import { redis } from '../config';
import logger from './logger';

// Anti-Stampede: Tracks in-flight fetch requests
const pendingFetches = new Map<string, Promise<any>>();

/**
 * Robust Redis Wrapper using ioredis
 * Adds Layer 2 features: Caching patterns, Locking, Anti-Stampede
 */
export const redisHelper = {
  
  // --- BASIC OPS ---
  get: async <T>(key: string): Promise<T | null> => {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  set: async (key: string, data: any, ttlSeconds: number = 900): Promise<void> => {
    try {
      const value = JSON.stringify(data);
      await redis.set(key, value, 'EX', ttlSeconds);
    } catch (e: any) {
      logger.warn(`Redis Set Error: ${e.message}`);
    }
  },

  del: async (key: string): Promise<void> => {
    try { await redis.del(key); } catch (e) {}
  },

  incr: async (key: string): Promise<number> => {
    try { return await redis.incr(key); } catch (e) { return 0; }
  },

  expire: async (key: string, seconds: number): Promise<boolean> => {
    try { return (await redis.expire(key, seconds)) === 1; } catch (e) { return false; }
  },

  // --- ADVANCED: Smart Fetching (Graceful Degradation) ---
  /**
   * Tries to get from cache. If missing, runs the fetcher function, caches result, and returns.
   * Prevents "Cache Stampede" by deduplicating simultaneous requests.
   */
  getOrFetch: async <T>(key: string, fetcher: () => Promise<T>, ttlSeconds: number = 900): Promise<T> => {
    // 1. Try Cache
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached) as T;
    } catch (err) {
      logger.warn(`Redis Read Fail for ${key}, falling back to fetcher.`);
    }

    // 2. Anti-Stampede (Deduplicate in-flight requests)
    if (pendingFetches.has(key)) {
      return pendingFetches.get(key) as Promise<T>;
    }

    // 3. Execute Fetch
    const fetchPromise = (async () => {
      try {
        const freshData = await fetcher();
        if (freshData) {
          // Fire and forget cache update
          redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds).catch(e => 
            logger.warn(`Redis Write Fail: ${e.message}`)
          );
        }
        return freshData;
      } catch (error) {
        throw error;
      }
    })();

    pendingFetches.set(key, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      pendingFetches.delete(key);
    }
  },

  // --- LOCKING (Workers) ---
  acquireLock: async (key: string, ttlSeconds: number = 60): Promise<boolean> => {
    try {
      // SET key value NX (Not Exists) EX (Expire)
      const result = await redis.set(key, 'LOCKED', 'NX', 'EX', ttlSeconds);
      return result === 'OK';
    } catch (e) {
      return false;
    }
  },

  releaseLock: async (key: string): Promise<void> => {
    try { await redis.del(key); } catch (e) {}
  },
  
  isReady: () => redis.status === 'ready'
};

export default redisHelper;
