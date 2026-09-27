import crypto from 'node:crypto';

/**
 * Enterprise College ERP - Cryptographic Engine
 * Provides HMAC-SHA256, Ed25519 digital signatures, and token hashing.
 */

const DEV_FALLBACK_SECRET = 'erp-super-secret-cryptographic-salt-2026';

/**
 * Resolve the institutional HMAC/derivation secret.
 *
 * A hard-coded fallback is convenient in development but catastrophic in
 * production: anyone reading the source could forge queue tokens and
 * anonymous barcodes. Fail closed when no strong secret is configured.
 */
function resolveDefaultSecret(): string {
  const configured = process.env.ERP_CRYPTO_SECRET;
  if (configured && configured.length >= 16) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ERP_CRYPTO_SECRET must be set to a strong value (>= 16 characters) in production.'
    );
  }
  return DEV_FALLBACK_SECRET;
}

// Global Institutional Ed25519 Keypair (cached in-memory or loaded from env)
let cachedKeyPair: { publicKey: string; privateKey: string } | null = null;

export function getInstitutionalKeyPair(): { publicKey: string; privateKey: string } {
  if (cachedKeyPair) {
    return cachedKeyPair;
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  cachedKeyPair = { publicKey, privateKey };
  return cachedKeyPair;
}

/**
 * Generate HMAC-SHA256 hex digest
 */
export function hmacSha256(payload: string, secret: string = resolveDefaultSecret()): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Compute SHA256 hex digest
 */
export function sha256(payload: string): string {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Compute Payment Idempotency Key
 * Formula: SHA256(student_id || fee_structure_id || semester || amount [|| sequence_or_order_id])
 * Supports distinct instalment transactions of identical amount in the same semester.
 */
export function computePaymentIdempotencyKey(
  studentId: string,
  feeStructureId: string,
  semester: number,
  amount: number,
  sequenceOrOrderId?: string | number
): string {
  const base = `${studentId}:${feeStructureId}:${semester}:${amount.toFixed(2)}`;
  return sha256(sequenceOrOrderId != null ? `${base}:${sequenceOrOrderId}` : base);
}

/**
 * Virtual Waiting Room Queue Token Generator & Verifier
 */
export interface QueueTokenPayload {
  studentId: string;
  queuePosition: number;
  timestamp: number;
  expiresAt: number;
}

export function generateQueueToken(
  studentId: string,
  queuePosition: number,
  validitySeconds: number = 600,
  secret: string = resolveDefaultSecret()
): { token: string; payload: QueueTokenPayload } {
  const now = Date.now();
  const payload: QueueTokenPayload = {
    studentId,
    queuePosition,
    timestamp: now,
    expiresAt: now + validitySeconds * 1000,
  };
  const serialized = JSON.stringify(payload);
  const signature = hmacSha256(serialized, secret);
  const token = `${Buffer.from(serialized).toString('base64url')}.${signature}`;
  return { token, payload };
}

export function verifyQueueToken(
  token: string,
  secret: string = resolveDefaultSecret()
): { valid: boolean; payload?: QueueTokenPayload; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Malformed token structure' };
    }
    const [serializedBase64, signature] = parts;
    const serialized = Buffer.from(serializedBase64, 'base64url').toString('utf8');
    const expectedSignature = hmacSha256(serialized, secret);

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false, error: 'Invalid HMAC signature' };
    }

    const payload: QueueTokenPayload = JSON.parse(serialized);
    if (Date.now() > payload.expiresAt) {
      return { valid: false, error: 'Queue token expired', payload };
    }

    return { valid: true, payload };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown parsing error';
    return { valid: false, error: message };
  }
}

/**
 * Recursive Canonical JSON Serializer
 * Ensures deterministic key ordering across all object nesting depths
 * without stripping nested properties.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k])).join(',') + '}';
}

/**
 * Dynamic 10-Second Rolling Attendance QR Code Generator
 * QR Token = HMAC-SHA256(offeringId || floor(t / 10) || roomSecret)
 */
export function generateRollingAttendanceToken(
  offeringId: string,
  roomSecret: string,
  timestampMs: number = Date.now(),
  stepSeconds: number = 10
): { token: string; timeStep: number; expiresAtMs: number } {
  const timeStep = Math.floor(timestampMs / (stepSeconds * 1000));
  const payload = `${offeringId}:${timeStep}:${roomSecret}`;
  const token = hmacSha256(payload, roomSecret);
  const expiresAtMs = (timeStep + 1) * stepSeconds * 1000;
  return { token, timeStep, expiresAtMs };
}

export function verifyRollingAttendanceToken(
  offeringId: string,
  tokenToVerify: string,
  roomSecret: string,
  currentTimestampMs: number = Date.now(),
  stepSeconds: number = 10,
  allowedDriftSteps: number = 0 // Strict 10-second rule: 0 drift
): { valid: boolean; error?: string } {
  if (!tokenToVerify || typeof tokenToVerify !== 'string' || tokenToVerify.length !== 64) {
    return { valid: false, error: 'Malformed or invalid token length' };
  }

  const currentStep = Math.floor(currentTimestampMs / (stepSeconds * 1000));
  let tokenBuf: Buffer;
  try {
    tokenBuf = Buffer.from(tokenToVerify, 'hex');
    if (tokenBuf.length !== 32) {
      return { valid: false, error: 'Invalid hex token' };
    }
  } catch {
    return { valid: false, error: 'Invalid hex encoding' };
  }

  for (let drift = -allowedDriftSteps; drift <= allowedDriftSteps; drift++) {
    const targetStep = currentStep + drift;
    const expectedPayload = `${offeringId}:${targetStep}:${roomSecret}`;
    const expectedToken = hmacSha256(expectedPayload, roomSecret);
    const expectedBuf = Buffer.from(expectedToken, 'hex');

    if (tokenBuf.length === expectedBuf.length && crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
      return { valid: true };
    }
  }

  return { valid: false, error: 'Token expired or invalid for this time step' };
}

/**
 * Double-Blind OSV Barcode Masking
 * Obfuscates student identity on answer scripts
 */
export function generateAnonymousBarcode(
  studentId: string,
  assessmentId: string,
  salt: string = resolveDefaultSecret()
): string {
  const hash = hmacSha256(`${studentId}:${assessmentId}`, salt);
  return `OSV-${hash.substring(0, 16).toUpperCase()}`;
}

/**
 * Ed25519 Verifiable Marksheet Signer and Verifier
 */
export function signVerifiableDocument(
  data: Record<string, unknown>,
  privateKeyPem?: string
): { signature: string; publicKeyPem: string; documentHash: string } {
  const keys = getInstitutionalKeyPair();
  const privKey = privateKeyPem || keys.privateKey;
  const canonicalData = canonicalJson(data);
  const documentHash = sha256(canonicalData);

  const signature = crypto.sign(null, Buffer.from(documentHash, 'utf8'), privKey).toString('base64');
  return {
    signature,
    publicKeyPem: keys.publicKey,
    documentHash,
  };
}

export function verifyVerifiableDocument(
  data: Record<string, unknown>,
  signature: string,
  publicKeyPem: string
): boolean {
  try {
    const canonicalData = canonicalJson(data);
    const documentHash = sha256(canonicalData);
    return crypto.verify(
      null,
      Buffer.from(documentHash, 'utf8'),
      publicKeyPem,
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}
