import EventEmitter from 'node:events';

/**
 * Enterprise College ERP - High-Performance Redis Client & In-Memory Engine
 * Provides atomic operations, Lua emulation for course seat reservation,
 * distributed locks, token bucket rate limiting, and pub/sub.
 */

export interface RedisValueEntry {
  value: string;
  expiresAt: number | null; // ms timestamp
}

export class InMemoryRedisClient extends EventEmitter {
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

  /**
   * Acquire a distributed lock (Redlock style) with TTL
   */
  async acquireLock(lockKey: string, owner: string, ttlMs: number = 5000): Promise<boolean> {
    const now = Date.now();
    const existing = this.locks.get(lockKey);
    if (existing && existing.expiresAt > now) {
      if (existing.owner === owner) {
        // Re-entrant lock renewal
        existing.expiresAt = now + ttlMs;
        return true;
      }
      return false;
    }
    this.locks.set(lockKey, { owner, expiresAt: now + ttlMs });
    return true;
  }

  /**
   * Release a distributed lock safely if owned
   */
  async releaseLock(lockKey: string, owner: string): Promise<boolean> {
    const existing = this.locks.get(lockKey);
    if (!existing) return true;
    if (existing.owner === owner) {
      this.locks.delete(lockKey);
      return true;
    }
    return false;
  }

  /**
   * Lua Script Emulation
   * Handles the atomic course seat reservation script from PRD Module 1
   */
  async eval(script: string, numKeys: number, ...args: string[]): Promise<unknown> {
    const keys = args.slice(0, numKeys);
    const argv = args.slice(numKeys);

    // Module 1: Atomic Seat Decrement & Reservation
    // KEYS[1] = course:{id}:seats
    // KEYS[2] = reservation:{student_id}:{course_id}
    // ARGV[1] = student_id
    if (script.includes("redis.call('DECR', KEYS[1])") || script.includes('course seat reserve')) {
      const seatsKey = keys[0];
      const reservationKey = keys[1];
      const studentId = argv[0];
      const ttl = argv[1] ? parseInt(argv[1], 10) : 300;

      // The real Lua script executes GET + DECR + SETEX atomically. Because this
      // emulation is synchronous once inside the branch, all four ops must run
      // without an intervening await — otherwise concurrent reservations all
      // read the same seat count and over-reserve.
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

    // Default basic Lua eval fallback
    return 0;
  }

  /**
   * Sliding Window Token Bucket Waiting Room Limiter
   * Returns: { allowed: boolean, queuePosition: number, currentActive: number }
   */
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

    // Remove active users whose 10-minute session has expired
    for (const [id, expiry] of activeMap.entries()) {
      if (now > expiry) {
        activeMap.delete(id);
      }
    }

    // If already active, renew session
    if (activeMap.has(studentId)) {
      activeMap.set(studentId, now + 10 * 60 * 1000);
      return { allowed: true, queuePosition: 0, activeCount: activeMap.size };
    }

    // If active capacity available, admit immediately
    if (activeMap.size < maxConcurrentActive) {
      activeMap.set(studentId, now + 10 * 60 * 1000);
      return { allowed: true, queuePosition: 0, activeCount: activeMap.size };
    }

    // Otherwise, assign a fair queue position
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
}

// Global Singleton Instance
export const redis = new InMemoryRedisClient();
