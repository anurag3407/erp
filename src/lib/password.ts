import crypto from 'node:crypto';

/**
 * Password hashing and verification.
 *
 * Uses Node's built-in `scrypt` (memory-hard, no native dependency) with a
 * per-password random salt. The stored format is self-describing so the
 * parameters can be raised later without invalidating existing hashes:
 *
 *   scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>
 */

const SCRYPT_N = 16384; // CPU/memory cost
const SCRYPT_R = 8; // block size
const SCRYPT_P = 1; // parallelization
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEM = 64 * 1024 * 1024; // allow headroom above 128*N*r

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

/**
 * Baseline institutional password policy. Kept deliberately simple (length +
 * character classes); breach-list / history checks can be layered on later.
 */
export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const errors: string[] = [];
  if (password.length < 12) errors.push('be at least 12 characters long');
  if (!/[A-Z]/.test(password)) errors.push('include an uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('include a lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('include a digit');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('include a symbol');
  return {
    valid: errors.length === 0,
    errors: errors.length === 0 ? [] : [`Password must ${errors.join(', ')}.`],
  };
}

function deriveKey(
  password: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
  keyLength: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLength, { N, r, p, maxmem: MAX_MEM }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

/**
 * Hash a plaintext password. Rejects passwords that fail the policy unless
 * `skipPolicy` is set (used when importing legacy credentials).
 */
export async function hashPassword(password: string, skipPolicy = false): Promise<string> {
  if (!skipPolicy) {
    const policy = validatePasswordPolicy(password);
    if (!policy.valid) {
      throw new Error(`WEAK_PASSWORD: ${policy.errors.join(' ')}`);
    }
  }
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derived = await deriveKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH);
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verify a plaintext password against a stored hash. Always returns a boolean
 * and never throws on malformed input, so callers cannot leak parsing details.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (N <= 0 || r <= 0 || p <= 0 || N > (1 << 20) || r > 32 || p > 16) return false;

  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await deriveKey(password, salt, N, r, p, expected.length);
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Constant-time password check that always performs a derivation, even when
 * the account does not exist, to blunt user-enumeration timing oracles.
 */
export async function verifyPasswordOrDummy(password: string, stored?: string): Promise<boolean> {
  const DUMMY_HASH =
    'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
    crypto.createHash('sha256').update('dummy').digest('base64');
  const target = stored ?? DUMMY_HASH;
  const result = await verifyPassword(password, target);
  return stored !== undefined && result;
}
