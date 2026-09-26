import { redis } from '../../lib/redis.js';

/**
 * Login throttling & account lockout.
 *
 * Counts failed attempts per key (email and, where available, client IP) in
 * Redis and locks the key for a cooldown once the threshold is reached. The
 * counter uses a sliding window: the first failure sets the TTL, subsequent
 * failures increment it. Successful login clears the counters.
 */

export const MAX_FAILED_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
export const FAILURE_WINDOW_SECONDS = Number(process.env.LOGIN_FAILURE_WINDOW_SECONDS ?? 15 * 60);
export const LOCKOUT_SECONDS = Number(process.env.LOGIN_LOCKOUT_SECONDS ?? 15 * 60);

const failKey = (key: string) => `erp:login:fail:${key}`;
const lockKey = (key: string) => `erp:login:lock:${key}`;

/** Normalize a key so casing/whitespace cannot bypass the counter. */
export function normalizeThrottleKey(key: string): string {
  return key.trim().toLowerCase();
}

export interface ThrottleCheck {
  locked: boolean;
  retryAfterSeconds: number;
}

export class LoginThrottle {
  async check(keys: string[]): Promise<ThrottleCheck> {
    let retryAfterSeconds = 0;
    for (const raw of keys) {
      const key = normalizeThrottleKey(raw);
      const lock = await redis.get(lockKey(key));
      if (lock) {
        const ttl = await redis.ttl(lockKey(key));
        retryAfterSeconds = Math.max(retryAfterSeconds, ttl > 0 ? ttl : LOCKOUT_SECONDS);
      }
    }
    return { locked: retryAfterSeconds > 0, retryAfterSeconds };
  }

  async recordFailure(keys: string[]): Promise<void> {
    for (const raw of keys) {
      const key = normalizeThrottleKey(raw);
      const attempts = await redis.incr(failKey(key));
      if (attempts === 1) {
        await redis.setex(failKey(key), FAILURE_WINDOW_SECONDS, String(attempts));
      }
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await redis.setex(lockKey(key), LOCKOUT_SECONDS, '1');
      }
    }
  }

  async clear(keys: string[]): Promise<void> {
    for (const raw of keys) {
      const key = normalizeThrottleKey(raw);
      await redis.del(failKey(key), lockKey(key));
    }
  }

  async failedAttempts(key: string): Promise<number> {
    const value = await redis.get(failKey(normalizeThrottleKey(key)));
    return value ? Number(value) || 0 : 0;
  }
}

export const loginThrottle = new LoginThrottle();
