import crypto from 'node:crypto';
import { redis } from '../../lib/redis.js';

/**
 * Redis-backed auth sessions.
 *
 * Session identifiers are 256-bit random tokens (never guessable, never
 * sequential). The record is stored server-side under `erp:session:<id>` with
 * a TTL, so a stolen cookie can be revoked centrally and sessions expire even
 * if the client keeps replaying the cookie.
 */

export interface SessionRecord {
  /** Opaque session token (also the value of the session cookie). */
  id: string;
  /** users.id — the authenticated principal. */
  userId: string;
  role: string;
  email: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface NewSessionInput {
  userId: string;
  role: string;
  email: string;
  name: string;
}

/** Session lifetime in seconds (7 days), refreshed on activity. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const sessionKey = (id: string): string => `erp:session:${id}`;

function newSessionId(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export class SessionStore {
  async create(input: NewSessionInput): Promise<SessionRecord> {
    const now = Date.now();
    const record: SessionRecord = {
      id: newSessionId(),
      userId: input.userId,
      role: input.role,
      email: input.email,
      name: input.name,
      createdAt: now,
      lastSeenAt: now,
    };
    await redis.setex(sessionKey(record.id), SESSION_TTL_SECONDS, JSON.stringify(record));
    return record;
  }

  async get(id: string): Promise<SessionRecord | null> {
    if (!id) return null;
    const raw = await redis.get(sessionKey(id));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as SessionRecord;
      if (!parsed || typeof parsed.id !== 'string' || typeof parsed.userId !== 'string') {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /** Sliding expiration: extend the TTL on activity. */
  async touch(record: SessionRecord): Promise<void> {
    record.lastSeenAt = Date.now();
    await redis.setex(sessionKey(record.id), SESSION_TTL_SECONDS, JSON.stringify(record));
  }

  async destroy(id: string): Promise<void> {
    await redis.del(sessionKey(id));
  }

  /**
   * Revoke every session belonging to a user (e.g. password change, forced
   * logout, or suspected compromise).
   */
  async destroyAllForUser(userId: string): Promise<number> {
    const keys = await redis.keys('erp:session:*');
    let removed = 0;
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      try {
        const record = JSON.parse(raw) as SessionRecord;
        if (record.userId === userId) {
          await redis.del(key);
          removed += 1;
        }
      } catch {
        // Ignore malformed entries.
      }
    }
    return removed;
  }
}

export const sessionStore = new SessionStore();
