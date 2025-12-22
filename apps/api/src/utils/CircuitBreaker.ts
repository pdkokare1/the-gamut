// apps/api/src/utils/CircuitBreaker.ts
import redisHelper from './redis';
import logger from './logger';

/**
 * Standardized Circuit Breaker
 * Protects external APIs from cascading failures.
 */
class CircuitBreaker {
    
    // Checks if we should allow requests to this provider
    async isOpen(provider: string): Promise<boolean> {
        if (!redisHelper.isReady()) return true; // Fail open if Redis is down
        
        const key = `breaker:open:${provider}`;
        const isBlocked = await redisHelper.get(key);
        
        // If key exists in Redis, it means breaker is OPEN (Blocked)
        return !isBlocked; 
    }

    // Records a failure. If threshold met, blocks provider.
    async recordFailure(provider: string, threshold: number = 3, cooldownSeconds: number = 1800) {
        if (!redisHelper.isReady()) return;

        const failKey = `breaker:fail:${provider}`;
        const openKey = `breaker:open:${provider}`;

        try {
            const count = await redisHelper.incr(failKey);
            
            // Set window for failure counting (e.g., 10 mins)
            if (count === 1) await redisHelper.expire(failKey, 600);

            if (count >= threshold) {
                logger.error(`🔥 ${provider} failing repeatedly (${count}). Opening Breaker for ${cooldownSeconds}s.`);
                // Set the blocking key
                await redisHelper.set(openKey, '1', cooldownSeconds); 
                // Reset failure counter
                await redisHelper.del(failKey); 
            }
        } catch (error: any) {
            logger.warn(`CircuitBreaker Error: ${error.message}`);
        }
    }

    // Call this on success to reset the "wobble" counter
    async recordSuccess(provider: string) {
        if (!redisHelper.isReady()) return;
        await redisHelper.del(`breaker:fail:${provider}`);
    }
}

export default new CircuitBreaker();
