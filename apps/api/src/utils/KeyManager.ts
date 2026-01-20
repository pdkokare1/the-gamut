// apps/api/src/utils/KeyManager.ts
import redis from './redis';
import logger from './logger';

interface IKey {
    key: string;
    provider: string;
}

class KeyManager {
    private keys: Map<string, IKey>;
    
    // Config: How long to ban a key if it fails?
    private readonly COOLDOWN_TIME_SECONDS = 600; // 10 minutes
    private readonly MAX_ERRORS_BEFORE_COOLDOWN = 5;
    
    // Redis Keys Prefixes
    private readonly REDIS_PREFIX_COOLDOWN = 'key_cooldown:';
    private readonly REDIS_PREFIX_ERROR = 'key_errors:';
    private readonly REDIS_KEY_CIRCUIT_BREAKER = 'global_circuit_breaker';

    private readonly GLOBAL_ERROR_THRESHOLD = 20;

    constructor() {
        this.keys = new Map();
    }

    /**
     * Registers a list of API keys for a specific provider.
     */
    public registerProviderKeys(providerName: string, keys: string[]): void {
        if (!keys || keys.length === 0) {
            logger.warn(`⚠️ No API Keys provided for ${providerName}`);
            return;
        }

        let addedCount = 0;
        keys.forEach(k => {
            if (!this.keys.has(k)) {
                this.keys.set(k, {
                    key: k,
                    provider: providerName
                });
                addedCount++;
            }
        });

        logger.info(`✅ Registered ${addedCount} keys for ${providerName}`);
    }

    /**
     * Gets the best available key.
     * Strategy: PRIORITY (Failover) with Distributed State.
     */
    public async getKey(providerName: string): Promise<string> {
        // 1. Check Global Circuit Breaker
        const cbResetTime = await redis.get(this.REDIS_KEY_CIRCUIT_BREAKER);
        
        if (cbResetTime) {
            const resetTime = parseInt(cbResetTime, 10);
            if (Date.now() < resetTime) {
                const waitTime = Math.ceil((resetTime - Date.now()) / 1000);
                throw new Error(`CIRCUIT_BREAKER_ACTIVE: System cooling down for ${waitTime}s.`);
            }
        }

        // 2. Filter keys for this provider
        const allKeys = Array.from(this.keys.values()).filter(k => k.provider === providerName);
        if (allKeys.length === 0) throw new Error(`NO_KEYS_CONFIGURED: No keys for ${providerName}`);

        // 3. Priority Search
        for (const candidate of allKeys) {
            const isCoolingDown = await redis.get(`${this.REDIS_PREFIX_COOLDOWN}${candidate.key}`);
            if (isCoolingDown) continue; // Skip burnt keys

            return candidate.key;
        }

        throw new Error(`NO_KEYS_AVAILABLE: All ${providerName} keys are currently cooling down.`);
    }

    /**
     * Reports a failure. 
     * Uses Redis to track errors across multiple instances.
     */
    public async reportFailure(key: string, isRateLimit: boolean = false): Promise<void> {
        
        // 1. Handle Global Circuit Breaker Logic
        const globalErrorsKey = 'system:global_errors';
        const currentGlobalErrors = await redis.incr(globalErrorsKey);
        await redis.expire(globalErrorsKey, 300); // Window of 5 minutes

        if (currentGlobalErrors >= this.GLOBAL_ERROR_THRESHOLD) {
            const resetTime = Date.now() + (5 * 60 * 1000); // 5 mins
            await redis.set(this.REDIS_KEY_CIRCUIT_BREAKER, resetTime.toString(), 'EX', 300);
            logger.error("⛔ CRITICAL: Too many API failures. Global Circuit Breaker TRIPPED.");
        }

        // 2. Handle Individual Key Failure
        const keyObj = this.keys.get(key);
        if (!keyObj) return;
        
        let shouldBan = false;

        if (isRateLimit) {
            logger.warn(`⏳ Rate Limit hit on ...${key.slice(-4)}. Switching to backup key.`);
            shouldBan = true;
        } else {
            const errorKey = `${this.REDIS_PREFIX_ERROR}${key}`;
            const errorCount = await redis.incr(errorKey);
            await redis.expire(errorKey, 3600); // Reset count every hour

            if (errorCount >= this.MAX_ERRORS_BEFORE_COOLDOWN) {
                logger.warn(`⚠️ Key ...${key.slice(-4)} unstable (${errorCount} errors). Cooling down.`);
                shouldBan = true;
            }
        }

        if (shouldBan) {
            await redis.set(
                `${this.REDIS_PREFIX_COOLDOWN}${key}`, 
                'true', 
                'EX',
                this.COOLDOWN_TIME_SECONDS
            );
            await redis.del(`${this.REDIS_PREFIX_ERROR}${key}`);
        }
    }

    public async reportSuccess(key: string): Promise<void> {
        await redis.del(`${this.REDIS_PREFIX_ERROR}${key}`);
    }

    /**
     * CENTRALIZED RETRY LOGIC
     */
    public async executeWithRetry<T>(
        provider: string, 
        operation: (key: string) => Promise<T>
    ): Promise<T> {
        const errors: any[] = [];
        const MAX_ATTEMPTS = 3; 

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            let currentKey = '';
            try {
                currentKey = await this.getKey(provider);
                const result = await operation(currentKey);
                
                await this.reportSuccess(currentKey);
                return result;
            } catch (err: any) {
                errors.push(err);
                
                if (currentKey) {
                    const isRateLimit = err.status === 429 || err?.response?.status === 429;
                    await this.reportFailure(currentKey, isRateLimit);
                }

                logger.warn(`🔄 Retry attempt ${i+1}/${MAX_ATTEMPTS} for ${provider} failed. Moving to next key.`);
            }
        }
        
        const lastError = errors[errors.length - 1];
        const lastErrorMessage = lastError instanceof Error ? lastError.message : JSON.stringify(lastError);
        throw new Error(`Failed to execute ${provider} operation after ${MAX_ATTEMPTS} attempts. Last error: ${lastErrorMessage}`);
    }
}

export default new KeyManager();
