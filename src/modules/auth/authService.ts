import type { UserRole } from '../../types/index.js';
import { db } from '../../lib/db.js';
import { hashPassword, verifyPasswordOrDummy } from '../../lib/password.js';
import { sessionStore, type SessionRecord } from './sessionStore.js';

/**
 * Authentication service.
 *
 * The provider registry is deliberately pluggable: email + password ships
 * today, and a phone-OTP provider can be registered later without touching the
 * session or server-action layers. The service itself is framework-agnostic —
 * cookie handling lives in `src/lib/session.ts`.
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

export interface LoginResult {
  session: SessionRecord;
  user: AuthenticatedUser;
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
   * Authenticate credentials and, on success, open a new server-side session.
   * Returns null for any invalid credentials — callers must not distinguish
   * "no such user" from "wrong password".
   */
  async login(credentials: AuthCredentials): Promise<LoginResult | null> {
    const provider = this.providers.get(credentials.method);
    if (!provider) return null;

    const user = await provider.authenticate(credentials);
    if (!user) return null;

    const session = await sessionStore.create({
      userId: user.userId,
      role: user.role,
      email: user.email,
      name: user.name,
    });
    return { session, user };
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

  /** Create a password hash for a new/updated account (admin/user provisioning). */
  async setPasswordHash(plaintext: string): Promise<string> {
    return hashPassword(plaintext);
  }

  /** Force-revoke all sessions for a user. */
  async revokeAllSessions(userId: string): Promise<number> {
    return sessionStore.destroyAllForUser(userId);
  }
}

export const authService = new AuthService();
