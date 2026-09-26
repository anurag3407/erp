import { Redis } from '@upstash/redis';
import EventEmitter from 'node:events';

/**
 * Enterprise College ERP - Real Upstash Redis Client & Engine
 *
 * Built on @upstash/redis REST client for seamless serverless/Edge & Node.js execution.
 * Provides atomic operations, real Redis Lua scripting for course seat reservations,
 * distributed Redlock-style locks with atomic Lua, and sliding-window virtual waiting room.
 */

export interface RedisValueEntry {
  value: string;
  expiresAt: number | null; // ms timestamp
}

export interface UpstashRedisConfig {
  url?: string;
  token?: string;
}

export interface ErpRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<'OK'>;
  setex(key: string, seconds: number, value: string): Promise<'OK'>;
  decr(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  acquireLock(lockKey: string, owner: string, ttlMs?: number): Promise<boolean>;
  releaseLock(lockKey: string, owner: string): Promise<boolean>;
  eval(script: string, numKeysOrKeys: number | string[], ...args: any[]): Promise<unknown>;
  checkWaitingRoomSlot(
    studentId: string,
    maxConcurrentActive?: number
  ): Promise<{ allowed: boolean; queuePosition: number; activeCount: number }>;
  leaveWaitingRoom(studentId: string): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, listener: (message: string) => void): Promise<void>;
  flushall(): Promise<'OK'>;
  ping(): Promise<string>;
}

/**
 * Real Upstash Redis Client implementation using @upstash/redis REST API
 */
export class UpstashRedisClient extends EventEmitter implements ErpRedisClient {
  public readonly rawClient: Redis;

  constructor(config?: UpstashRedisConfig) {
    super();
    const url = config?.url || process.env.UPSTASH_REDIS_REST_URL;
    const token = config?.token || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in environment variables. ' +
        'See .env.example for configuration details.'
      );
    }

    this.rawClient = new Redis({
      url,
      token,
    });
  }

  async get(key: string): Promise<string | null> {
    const val = await this.rawClient.get<unknown>(key);
    if (val === null || val === undefined) return null;
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return JSON.stringify(val);
  }

  async set(key: string, value: string): Promise<'OK'> {
    await this.rawClient.set(key, value);
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    await this.rawClient.set(key, value, { ex: seconds });
    return 'OK';
  }

  async decr(key: string): Promise<number> {
    return await this.rawClient.decr(key);
  }

  async incr(key: string): Promise<number> {
    return await this.rawClient.incr(key);
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return await this.rawClient.del(...keys);
  }

  async exists(key: string): Promise<number> {
    return await this.rawClient.exists(key);
  }

  async ttl(key: string): Promise<number> {
    return await this.rawClient.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.rawClient.keys(pattern);
  }

  /**
   * Acquire a distributed lock (Redlock style) with TTL using atomic Lua
   */
  async acquireLock(lockKey: string, owner: string, ttlMs: number = 5000): Promise<boolean> {
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        redis.call('pexpire', KEYS[1], ARGV[2])
        return 1
      end
      if redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX') then
        return 1
      end
      return 0
    `;
    const res = await this.rawClient.eval(script, [lockKey], [owner, ttlMs.toString()]);
    return res === 1 || res === 'OK';
  }

  /**
   * Release a distributed lock safely only if owned by caller
   */
  async releaseLock(lockKey: string, owner: string): Promise<boolean> {
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    const res = await this.rawClient.eval(script, [lockKey], [owner]);
    return res === 1;
  }

  /**
   * Polymorphic Lua eval supporting both:
   * 1. (script, numKeys, ...keysAndArgs)
   * 2. (script, keysArray, argsArray)
   */
  async eval(script: string, numKeysOrKeys: number | string[], ...args: any[]): Promise<unknown> {
    let keys: string[] = [];
    let argv: (string | number)[] = [];

    if (typeof numKeysOrKeys === 'number') {
      const numKeys = numKeysOrKeys;
      keys = args.slice(0, numKeys).map(String);
      argv = args.slice(numKeys);
    } else if (Array.isArray(numKeysOrKeys)) {
      keys = numKeysOrKeys;
      argv = Array.isArray(args[0]) ? args[0] : args;
    }

    return await this.rawClient.eval(script, keys, argv);
  }

  /**
   * Sliding Window Token Bucket Waiting Room Limiter via Redis Sorted Sets (ZSET)
   */
  async checkWaitingRoomSlot(
    studentId: string,
    maxConcurrentActive: number = 500
  ): Promise<{ allowed: boolean; queuePosition: number; activeCount: number }> {
    const now = Date.now();
    const ttlMs = 10 * 60 * 1000; // 10 minutes session

    const script = `
      local activeKey = 'waiting_room:active_users'
      local queueKey = 'waiting_room:queue_positions'
      local studentId = ARGV[1]
      local maxCapacity = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local ttlMs = tonumber(ARGV[4])

      -- 1. Remove expired active users
      redis.call('ZREMRANGEBYSCORE', activeKey, 0, now)

      -- 2. If student is already active, renew session
      local activeScore = redis.call('ZSCORE', activeKey, studentId)
      if activeScore then
        redis.call('ZADD', activeKey, now + ttlMs, studentId)
        local count = redis.call('ZCARD', activeKey)
        return {1, 0, count}
      end

      -- 3. If active capacity available, admit immediately
      local currentActive = redis.call('ZCARD', activeKey)
      if currentActive < maxCapacity then
        redis.call('ZADD', activeKey, now + ttlMs, studentId)
        redis.call('ZREM', queueKey, studentId)
        return {1, 0, currentActive + 1}
      end

      -- 4. Otherwise, assign fair queue position
      local queuedScore = redis.call('ZSCORE', queueKey, studentId)
      if not queuedScore then
        redis.call('ZADD', queueKey, now, studentId)
      end
      local rank = redis.call('ZRANK', queueKey, studentId)
      local pos = (rank and (rank + 1)) or 1
      return {0, pos, currentActive}
    `;

    const res = (await this.rawClient.eval(
      script,
      ['waiting_room:active_users', 'waiting_room:queue_positions'],
      [studentId, maxConcurrentActive.toString(), now.toString(), ttlMs.toString()]
    )) as [number, number, number];

    const [allowed, queuePosition, activeCount] = res;
    return {
      allowed: allowed === 1,
      queuePosition: Number(queuePosition),
      activeCount: Number(activeCount),
    };
  }

  async leaveWaitingRoom(studentId: string): Promise<void> {
    await Promise.all([
      this.rawClient.zrem('waiting_room:active_users', studentId),
      this.rawClient.zrem('waiting_room:queue_positions', studentId),
    ]);
  }

  async publish(channel: string, message: string): Promise<number> {
    this.emit(`channel:${channel}`, message);
    try {
      return await this.rawClient.publish(channel, message);
    } catch {
      return 1;
    }
  }

  async subscribe(channel: string, listener: (message: string) => void): Promise<void> {
    this.on(`channel:${channel}`, listener);
  }

  async flushall(): Promise<'OK'> {
    await this.rawClient.flushdb();
    return 'OK';
  }

  async ping(): Promise<string> {
    return await this.rawClient.ping();
  }
}

/**
 * Local in-memory emulation for offline test environments and local development
 * when Upstash Redis credentials have not yet been provided in .env
 */
export class InMemoryRedisClient extends EventEmitter implements ErpRedisClient {
  private store = new Map<string, RedisValueEntry>();
  private locks = new Map<string, { owner: string; expiresAt: number }>();
  private sortedSets = new Map<string, Map<string, number>>();

  private isExpired(entry: RedisValueEntry): boolean {
    if (entry.expiresAt === null) return false;
    return Date.now() > entry.expiresAt;
  }

  private cleanIfExpired(key: string): void {
    const entry = this.store.get(key);
    if (entry && this.isExpired(entry)) {
      this.store.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    this.cleanIfExpired(key);
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: null });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    const expiresAt = Date.now() + seconds * 1000;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async decr(key: string): Promise<number> {
    this.cleanIfExpired(key);
    const current = this.store.get(key);
    let num = current ? parseInt(current.value, 10) : 0;
    if (isNaN(num)) num = 0;
    num -= 1;
    this.store.set(key, { value: num.toString(), expiresAt: current?.expiresAt ?? null });
    return num;
  }

  async incr(key: string): Promise<number> {
    this.cleanIfExpired(key);
    const current = this.store.get(key);
    let num = current ? parseInt(current.value, 10) : 0;
    if (isNaN(num)) num = 0;
    num += 1;
    this.store.set(key, { value: num.toString(), expiresAt: current?.expiresAt ?? null });
    return num;
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        deleted++;
      }
      this.locks.delete(key);
      this.sortedSets.delete(key);
    }
    return deleted;
  }

  async exists(key: string): Promise<number> {
    this.cleanIfExpired(key);
    return this.store.has(key) ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async keys(pattern: string): Promise<string[]> {
    const now = Date.now();
    const result: string[] = [];
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
        continue;
      }
      if (regex.test(key)) {
        result.push(key);
      }
    }
    return result;
  }

  async acquireLock(lockKey: string, owner: string, ttlMs: number = 5000): Promise<boolean> {
    const now = Date.now();
    const existing = this.locks.get(lockKey);
    if (existing && existing.expiresAt > now) {
      if (existing.owner === owner) {
        existing.expiresAt = now + ttlMs;
        return true;
      }
      return false;
    }
    this.locks.set(lockKey, { owner, expiresAt: now + ttlMs });
    return true;
  }

  async releaseLock(lockKey: string, owner: string): Promise<boolean> {
    const existing = this.locks.get(lockKey);
    if (!existing) return true;
    if (existing.owner === owner) {
      this.locks.delete(lockKey);
      return true;
    }
    return false;
  }

  async eval(script: string, numKeys: number, ...args: string[]): Promise<unknown> {
    const keys = args.slice(0, numKeys);
    const argv = args.slice(numKeys);

    if (script.includes("redis.call('DECR', KEYS[1])") || script.includes('course seat reserve')) {
      const seatsKey = keys[0];
      const reservationKey = keys[1];
      const studentId = argv[0];
      const ttl = argv[1] ? parseInt(argv[1], 10) : 300;

      this.cleanIfExpired(seatsKey);
      const currentEntry = this.store.get(seatsKey);
      const seats = currentEntry ? parseInt(currentEntry.value, 10) : 0;

      if (seats > 0) {
        this.store.set(seatsKey, {
          value: String(seats - 1),
          expiresAt: currentEntry?.expiresAt ?? null,
        });
        this.store.set(reservationKey, {
          value: studentId,
          expiresAt: Date.now() + (isNaN(ttl) ? 300 : ttl) * 1000,
        });
        return 1;
      }
      return 0;
    }

    return 0;
  }

  async checkWaitingRoomSlot(
    studentId: string,
    maxConcurrentActive: number = 500
  ): Promise<{ allowed: boolean; queuePosition: number; activeCount: number }> {
    const now = Date.now();
    const activeKey = 'waiting_room:active_users';
    const queueKey = 'waiting_room:queue_positions';

    let activeMap = this.sortedSets.get(activeKey);
    if (!activeMap) {
      activeMap = new Map<string, number>();
      this.sortedSets.set(activeKey, activeMap);
    }

    for (const [id, expiry] of activeMap.entries()) {
      if (now > expiry) {
        activeMap.delete(id);
      }
    }

    if (activeMap.has(studentId)) {
      activeMap.set(studentId, now + 10 * 60 * 1000);
      return { allowed: true, queuePosition: 0, activeCount: activeMap.size };
    }

    if (activeMap.size < maxConcurrentActive) {
      activeMap.set(studentId, now + 10 * 60 * 1000);
      return { allowed: true, queuePosition: 0, activeCount: activeMap.size };
    }

    let queueMap = this.sortedSets.get(queueKey);
    if (!queueMap) {
      queueMap = new Map<string, number>();
      this.sortedSets.set(queueKey, queueMap);
    }

    let pos = queueMap.get(studentId);
    if (!pos) {
      pos = queueMap.size + 1;
      queueMap.set(studentId, pos);
    }

    return { allowed: false, queuePosition: pos, activeCount: activeMap.size };
  }

  async leaveWaitingRoom(studentId: string): Promise<void> {
    const activeMap = this.sortedSets.get('waiting_room:active_users');
    if (activeMap) activeMap.delete(studentId);
    const queueMap = this.sortedSets.get('waiting_room:queue_positions');
    if (queueMap) queueMap.delete(studentId);
  }

  async publish(channel: string, message: string): Promise<number> {
    this.emit(`channel:${channel}`, message);
    return 1;
  }

  async subscribe(channel: string, listener: (message: string) => void): Promise<void> {
    this.on(`channel:${channel}`, listener);
  }

  async flushall(): Promise<'OK'> {
    this.store.clear();
    this.locks.clear();
    this.sortedSets.clear();
    return 'OK';
  }

  async ping(): Promise<string> {
    return 'PONG';
  }
}

declare global {
  // Reuse the client across Next.js dev hot-reloads.
  // eslint-disable-next-line no-var
  var __erpRedis: ErpRedisClient | undefined;
}

/**
 * Factory function to initialize the Redis client.
 * Connects to real Upstash Redis if UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
 * Otherwise falls back to in-memory emulation for offline test suites.
 */
export function createRedisClient(): ErpRedisClient {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  const isConfigured =
    Boolean(url && token) &&
    !url!.includes('<') &&
    !token!.includes('<') &&
    !url!.includes('your-upstash') &&
    !token!.includes('your-upstash');

  if (isConfigured) {
    return new UpstashRedisClient({ url, token });
  }

  return new InMemoryRedisClient();
}

// Global Singleton Instance
export const redis: ErpRedisClient = globalThis.__erpRedis ?? createRedisClient();

if (!globalThis.__erpRedis) {
  globalThis.__erpRedis = redis;
}
