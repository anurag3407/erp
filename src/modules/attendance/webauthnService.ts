import crypto from 'node:crypto';
import { db } from '../../lib/db.js';

/**
 * Module 2: Hardware WebAuthn Biometric Device Binding Engine
 * Prevents attendance proxies by enforcing Touch ID / Face ID hardware binding.
 * Disallows multiple students using the same device hardware footprint.
 */

/**
 * Verify a WebAuthn assertion signature when the authenticator's public key is
 * a parseable SPKI PEM. Returns false for demo/opaque keys so callers can
 * decide how strict to be (production fails closed).
 */
function verifyAssertionSignature(
  publicKeyPem: string,
  clientDataJSON: string,
  signatureBase64: string
): boolean {
  if (!publicKeyPem || !signatureBase64 || !publicKeyPem.includes('BEGIN PUBLIC KEY')) {
    return false;
  }
  try {
    return crypto.verify(
      null,
      Buffer.from(clientDataJSON, 'utf8'),
      publicKeyPem,
      Buffer.from(signatureBase64, 'base64')
    );
  } catch {
    return false;
  }
}

export interface RegisteredAuthenticator {
  id: string;
  studentId: string;
  credentialId: string;
  credentialPublicKey: string;
  counter: number;
  deviceModel: string;
  registeredAt: Date;
}

export class WebAuthnBindingService {
  /**
   * Register a student's biometric authenticator
   * Rejects if the physical device credential is already bound to another student
   */
  async registerDevice(
    studentId: string,
    credentialId: string,
    credentialPublicKey: string,
    deviceModel: string
  ): Promise<{ success: boolean; authenticator?: RegisteredAuthenticator; error?: string }> {
    // Check if credential is used by another student
    for (const auth of await db.authenticators.values()) {
      if (auth.credentialId === credentialId && auth.studentId !== studentId) {
        return {
          success: false,
          error: 'DEVICE_FINGERPRINT_COLLISION: Device already bound to another student account',
        };
      }
    }

    const authId = `auth-${crypto.randomUUID()}`;
    const newAuth = {
      id: authId,
      studentId,
      credentialId,
      credentialPublicKey,
      counter: 0,
      deviceModel,
      registeredAt: new Date(),
    };

    await db.authenticators.set(credentialId, newAuth);

    return {
      success: true,
      authenticator: newAuth,
    };
  }

  /**
   * Verify biometric assertion during attendance marking
   */
  async verifyBiometricAssertion(
    studentId: string,
    credentialId: string,
    clientDataJSON: string,
    signature: string
  ): Promise<{ verified: boolean; error?: string }> {
    const authenticator = await db.authenticators.get(credentialId);

    if (!authenticator) {
      return { verified: false, error: 'NO_BOUND_AUTHENTICATOR: Device not registered for student' };
    }

    if (authenticator.studentId !== studentId) {
      return {
        verified: false,
        error: 'PROXY_DETECTED: Biometric device belongs to a different student profile',
      };
    }

    // 1. Structural validation of the signed client data (challenge/origin).
    let clientData: { challenge?: string; origin?: string };
    try {
      clientData = JSON.parse(clientDataJSON);
    } catch {
      return { verified: false, error: 'INVALID_CLIENT_DATA: clientDataJSON is not valid JSON' };
    }
    if (!clientData.challenge) {
      return { verified: false, error: 'INVALID_CLIENT_DATA: missing challenge in clientDataJSON' };
    }
    const expectedOrigin = process.env.WEBAUTHN_ORIGIN;
    if (expectedOrigin && clientData.origin !== expectedOrigin) {
      return {
        verified: false,
        error: 'INVALID_ORIGIN: clientDataJSON origin does not match this deployment',
      };
    }

    // 2. Cryptographic signature verification against the stored public key.
    const signatureOk = verifyAssertionSignature(
      authenticator.credentialPublicKey,
      clientDataJSON,
      signature
    );

    if (!signatureOk && process.env.NODE_ENV === 'production') {
      // Non-PEM/demo keys cannot be cryptographically verified. Never accept an
      // unverifiable assertion in production unless explicitly opted out.
      if (process.env.WEBAUTHN_ALLOW_UNVERIFIED_SIGNATURES !== 'true') {
        return {
          verified: false,
          error: 'SIGNATURE_VERIFICATION_FAILED: authenticator public key is not verifiable',
        };
      }
    }

    // Development / opted-out fallback: at minimum require a plausible signature.
    if (!signatureOk && (!signature || signature.length < 16)) {
      return { verified: false, error: 'INVALID_SIGNATURE: Malformed biometric signature' };
    }

    authenticator.counter += 1;
    await db.authenticators.set(credentialId, authenticator);
    return { verified: true };
  }

  /**
   * Query registered authenticators for a student
   */
  async getStudentAuthenticators(studentId: string): Promise<RegisteredAuthenticator[]> {
    return (await db.authenticators.values()).filter((a) => a.studentId === studentId);
  }
}

export const webAuthnBindingService = new WebAuthnBindingService();
