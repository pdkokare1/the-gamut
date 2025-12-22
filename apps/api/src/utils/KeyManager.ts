// apps/api/src/utils/KeyManager.ts
import redisHelper from './redis';
import logger from './logger';
import { config } from '../config';

interface IKey {
    key: string;
    provider: string;
}

class KeyManager {
    private keys: Map<string, IKey>;
    
    private readonly COOLDOWN_TIME_SECONDS = 600; // 10 minutes
    private readonly MAX_ERRORS_BEFORE_COOLDOWN = 5;
    private readonly REDIS_PREFIX_COOLDOWN = 'key_cooldown:';
    private readonly REDIS_PREFIX_ERROR = 'key_errors:';

    constructor() {
        this.keys = new Map();
        // Auto-register keys from config
        this.registerProviderKeys('GEMINI', config.keys.gemini);
        this.registerProviderKeys('NEWS_API', config.keys.newsApi);
        this.registerProviderKeys('GNEWS', config.keys.gnews);
    }

    public registerProviderKeys(providerName: string, keys: string[]): void {
        if (!keys || keys.length === 0) return;
        
        keys.forEach(k => {
            if (!this.keys.has(k)) {
                this.keys.set(k, { key: k, provider: providerName });
            }
        });
        logger.info(`🔑 Registered ${keys.length} keys for ${providerName}`);
    }

    public async getKey(providerName: string): Promise<string> {
        const allKeys = Array.from(this.keys.values()).filter(k => k.provider === providerName);
        if (allKeys.length === 0) throw new Error(`NO_KEYS_CONFIGURED: No keys for ${providerName}`);

        // Priority Search: Find first key NOT in cooldown
        for (const candidate of allKeys) {
            const isCoolingDown = await redisHelper.get(`${this.REDIS_PREFIX_COOLDOWN}${candidate.key}`);
            if (isCoolingDown) continue; 
            return candidate.key;
        }

        throw new Error(`NO_KEYS_AVAILABLE: All ${providerName} keys are cooling down.`);
    }

    public async reportFailure(key: string, isRateLimit: boolean = false): Promise<void> {
        const keyObj = this.keys.get(key);
        if (!keyObj) return;
        
        let shouldBan = false;

        if (isRateLimit) {
            logger.warn(`⏳ Rate Limit hit on ...${key.slice(-4)}. Switching keys.`);
            shouldBan = true;
        } else {
            const errorKey = `${this.REDIS_PREFIX_ERROR}${key}`;
            const errorCount = await redisHelper.incr(errorKey);
            await redisHelper.expire(errorKey, 3600); 

            if (errorCount >= this.MAX_ERRORS_BEFORE_COOLDOWN) {
                logger.warn(`⚠️ Key ...${key.slice(-4)} unstable. Cooling down.`);
                shouldBan = true;
            }
        }

        if (shouldBan) {
            await redisHelper.set(`${this.REDIS_PREFIX_COOLDOWN}${key}`, 'true', this.COOLDOWN_TIME_SECONDS);
            await redisHelper.del(`${this.REDIS_PREFIX_ERROR}${key}`);
        }
    }

    public async reportSuccess(key: string): Promise<void> {
        await redisHelper.del(`${this.REDIS_PREFIX_ERROR}${key}`);
    }

    /**
     * Executes function with automatic key rotation and retries
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
                logger.debug(`🔄 Retry ${i+1}/${MAX_ATTEMPTS} for ${provider} failed.`);
            }
        }
        
        throw new Error(`Failed to execute ${provider} op: ${errors.pop()?.message}`);
    }
}

export default new KeyManager();
