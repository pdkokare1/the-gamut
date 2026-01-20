// apps/api/src/utils/CircuitBreaker.ts
import redis from './redis';
import logger from './logger';

/**
 * Standardized Circuit Breaker to protect external APIs 
 * from being hammered when they are down or rate-limited.
 */
class CircuitBreaker {
    
    /**
     * Checks if the circuit is OPEN (Blocked).
     * Returns TRUE if requests are allowed (Closed).
     * Returns FALSE if requests are blocked (Open).
     */
    async isOpen(provider: string): Promise<boolean> {
        // Fail open (allow traffic) if Redis is down/missing to prevent total blockage
        if (!redis) return true; 
        
        const key = `breaker:open:${provider}`;
        const isBlocked = await redis.get(key);
        
        // If key exists, breaker is OPEN (Blocked).
        return !isBlocked; 
    }

    /**
     * Records a failure for a provider.
     * If failures exceed the threshold, it opens the circuit.
     */
    async recordFailure(provider: string, threshold: number = 3, cooldownSeconds: number = 1800) {
        if (!redis) return;

        const failKey = `breaker:fail:${provider}`;
        const openKey = `breaker:open:${provider}`;

        try {
            // Increment failure count
            const count = await redis.incr(failKey);
            
            // Set a short expiry for the failure counter window (e.g., 10 mins)
            if (count === 1) await redis.expire(failKey, 600);

            // If failures exceed threshold, OPEN THE BREAKER
            if (count >= threshold) {
                logger.error(`🔥 ${provider} is failing repeatedly (${count} times). Opening Circuit Breaker for ${cooldownSeconds}s.`);
                await redis.set(openKey, '1', 'EX', cooldownSeconds); 
                await redis.del(failKey); // Reset counter
            }
        } catch (error: any) {
            logger.warn(`CircuitBreaker Error: ${error.message}`);
        }
    }

    /**
     * Resets the failure count. Call this on a successful request.
     */
    async recordSuccess(provider: string) {
        if (!redis) return;
        await redis.del(`breaker:fail:${provider}`);
    }
}

export default new CircuitBreaker();
