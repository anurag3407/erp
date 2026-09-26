import crypto from 'node:crypto';
import type { UserRole } from '../../types/index.js';
import { db } from '../../lib/db.js';
import {
  hashPassword,
  verifyPassword,
  verifyPasswordOrDummy,
} from '../../lib/password.js';
import { sha256 } from '../../lib/crypto.js';
import { redis } from '../../lib/redis.js';
import { sessionStore, type SessionRecord } from './sessionStore.js';
import { loginThrottle } from './loginThrottle.js';

/**
 * Authentication service.
 *
 * The provider registry is deliberately pluggable: email + password ships
 * today, and a phone-OTP provider can be registered later without touching the
 * session, throttle, or server-action layers. The service is framework-
 * agnostic — cookie handling lives in `src/lib/session.ts`.
 */

export type AuthMethod = 'PASSWORD' | 'OTP';

export interface AuthenticatedUser {
  /** users.id */
  userId: string;
  role: UserRole;
  email: string;
  name: string;
}

export interface PasswordCredentials {
  method: 'PASSWORD';
  email: string;
  password: string;
}

export interface OtpCredentials {
  method: 'OTP';
  phone: string;
  code: string;
}

export type AuthCredentials = PasswordCredentials | OtpCredentials;

export interface AuthProvider<C extends AuthCredentials = AuthCredentials> {
  readonly method: AuthMethod;
  authenticate(credentials: C): Promise<AuthenticatedUser | null>;
}

/**
 * Email + password provider backed by the `users` table.
 */
export class PasswordAuthProvider implements AuthProvider<PasswordCredentials> {
  readonly method = 'PASSWORD' as const;

  async authenticate(credentials: PasswordCredentials): Promise<AuthenticatedUser | null> {
    const email = credentials.email.trim().toLowerCase();
    const user = await db.users.findOne('email', email);

    // Always run a derivation (real or dummy) so a missing account and a wrong
    // password take comparable time, preventing user enumeration.
    const passwordOk = await verifyPasswordOrDummy(
      credentials.password,
      user ? (user.passwordHash as string) : undefined
    );

    if (!user || !passwordOk) {
      return null;
    }

    return {
      userId: user.id as string,
      role: user.role as UserRole,
      email: user.email as string,
      name: user.name as string,
    };
  }
}

export interface LoginSuccess {
  status: 'OK';
  session: SessionRecord;
  user: AuthenticatedUser;
}
export interface LoginInvalid {
  status: 'INVALID';
}
export interface LoginLocked {
  status: 'LOCKED';
  retryAfterSeconds: number;
}
export type LoginOutcome = LoginSuccess | LoginInvalid | LoginLocked;

export interface CreateUserInput {
  email: string;
  name: string;
  role: UserRole;
  departmentId?: string;
  password?: string;
}

export interface CreateUserResult {
  userId: string;
  email: string;
  /** Present only when the password was generated server-side. */
  generatedPassword?: string;
}

const RESET_TOKEN_TTL_SECONDS = 30 * 60;
const resetKey = (token: string): string => `erp:pwreset:${sha256(token)}`;

function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const pick = (n: number) =>
    Array.from({ length: n }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `Tmp!${pick(8)}${crypto.randomInt(1000, 9999)}`;
}

export class AuthService {
  private providers = new Map<AuthMethod, AuthProvider<any>>();

  constructor() {
    this.register(new PasswordAuthProvider());
  }

  register(provider: AuthProvider<any>): void {
    this.providers.set(provider.method, provider);
  }

  hasProvider(method: AuthMethod): boolean {
    return this.providers.has(method);
  }

  /**
   * Authenticate credentials, enforcing lockout, and open a session on success.
   * Any invalid credentials collapse to `INVALID` — callers must not distinguish
   * "no such user" from "wrong password".
   */
  async login(credentials: AuthCredentials, clientKey?: string): Promise<LoginOutcome> {
    const identity =
      credentials.method === 'PASSWORD' ? credentials.email : credentials.phone;
    const throttleKeys = [identity, clientKey].filter((k): k is string => Boolean(k));

    const throttleState = await loginThrottle.check(throttleKeys);
    if (throttleState.locked) {
      return { status: 'LOCKED', retryAfterSeconds: throttleState.retryAfterSeconds };
    }

    const provider = this.providers.get(credentials.method);
    const user = provider ? await provider.authenticate(credentials) : null;
    if (!user) {
      await loginThrottle.recordFailure(throttleKeys);
      return { status: 'INVALID' };
    }

    await loginThrottle.clear(throttleKeys);
    const session = await sessionStore.create({
      userId: user.userId,
      role: user.role,
      email: user.email,
      name: user.name,
    });
    return { status: 'OK', session, user };
  }

  async logout(sessionId: string): Promise<void> {
    await sessionStore.destroy(sessionId);
  }

  /** Resolve the principal for a session token, refreshing its TTL. */
  async resolveSession(sessionId: string): Promise<SessionRecord | null> {
    const session = await sessionStore.get(sessionId);
    if (!session) return null;
    await sessionStore.touch(session);
    return session;
  }

  /** Create a password hash for a new/updated account. */
  async setPasswordHash(plaintext: string): Promise<string> {
    return hashPassword(plaintext);
  }

  /** Force-revoke all sessions for a user. */
  async revokeAllSessions(userId: string): Promise<number> {
    return sessionStore.destroyAllForUser(userId);
  }

  /**
   * Provision a new account. If no password is supplied a policy-compliant
   * temporary password is generated and returned once for delivery.
   */
  async createUserByAdmin(input: CreateUserInput): Promise<CreateUserResult> {
    const email = input.email.trim().toLowerCase();
    const existing = await db.users.findOne('email', email);
    if (existing) {
      throw new Error('EMAIL_TAKEN: A user with this email already exists');
    }

    let password = input.password;
    let generatedPassword: string | undefined;
    if (!password) {
      password = generateTempPassword();
      generatedPassword = password;
    }
    const passwordHash = await hashPassword(password);

    const userId = `usr-${crypto.randomUUID()}`;
    const now = new Date();
    await db.users.set(userId, {
      id: userId,
      email,
      name: input.name.trim(),
      role: input.role,
      departmentId: input.departmentId,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    } as any);

    return { userId, email, generatedPassword };
  }

  /**
   * Change a password after verifying the current one, then revoke every
   * session so stolen cookies cannot outlive a credential change.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await db.users.get(userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND: Account does not exist');
    }
    const currentOk = await verifyPassword(currentPassword, user.passwordHash as string);
    if (!currentOk) {
      throw new Error('INVALID_CREDENTIALS: Current password is incorrect');
    }
    user.passwordHash = await hashPassword(newPassword);
    user.updatedAt = new Date();
    await db.users.set(userId, user);
    await sessionStore.destroyAllForUser(userId);
  }

  /**
   * Begin a password reset. Returns null when the email is unknown so callers
   * can respond generically and avoid account enumeration. The token is stored
   * hashed (never in plaintext) with a short TTL and is single-use.
   */
  async requestPasswordReset(
    email: string
  ): Promise<{ token: string; userId: string; name: string; email: string } | null> {
    const normalized = email.trim().toLowerCase();
    const user = await db.users.findOne('email', normalized);
    if (!user) return null;

    const token = crypto.randomBytes(32).toString('base64url');
    await redis.setex(
      resetKey(token),
      RESET_TOKEN_TTL_SECONDS,
      JSON.stringify({ userId: user.id, email: normalized, createdAt: Date.now() })
    );
    return { token, userId: user.id as string, name: user.name as string, email: normalized };
  }

  /**
   * Complete a password reset with a valid token. Consumes the token and
   * revokes all sessions.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ userId: string }> {
    const key = resetKey(token);
    const raw = await redis.get(key);
    if (!raw) {
      throw new Error('INVALID_RESET_TOKEN: Token is invalid or has expired');
    }

    let payload: { userId?: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      await redis.del(key);
      throw new Error('INVALID_RESET_TOKEN: Token is invalid or has expired');
    }
    if (!payload.userId) {
      await redis.del(key);
      throw new Error('INVALID_RESET_TOKEN: Token is invalid or has expired');
    }

    const user = await db.users.get(payload.userId);
    if (!user) {
      await redis.del(key);
      throw new Error('INVALID_RESET_TOKEN: Token is invalid or has expired');
    }

    user.passwordHash = await hashPassword(newPassword);
    user.updatedAt = new Date();
    await db.users.set(user.id, user);
    await redis.del(key);
    await sessionStore.destroyAllForUser(user.id);
    return { userId: user.id as string };
  }
}

export const authService = new AuthService();
