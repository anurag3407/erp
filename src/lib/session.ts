import { cookies } from 'next/headers';
import { authService } from '../modules/auth/authService.js';
import { SESSION_TTL_SECONDS, type SessionRecord } from '../modules/auth/sessionStore.js';

/**
 * Session cookie plumbing. Kept separate from the framework-agnostic auth
 * service because it depends on Next's request context (`next/headers`).
 *
 * Security posture: HttpOnly (no JS access), SameSite=Lax (blocks cross-site
 * POST/session fixation while keeping top-level navigation working), Secure in
 * production, and a bounded Max-Age so a stale cookie is not replayed forever.
 * The cookie only carries an opaque random token — never user data.
 */

export const SESSION_COOKIE = 'erp_session';

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionId, cookieOptions(SESSION_TTL_SECONDS));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', cookieOptions(0));
}

export async function getSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Resolve the current session, refreshing its idle TTL. Returns null when the
 * caller is unauthenticated or the session has expired/been revoked.
 */
export async function getCurrentSession(): Promise<SessionRecord | null> {
  const id = await getSessionId();
  if (!id) return null;
  return authService.resolveSession(id);
}
