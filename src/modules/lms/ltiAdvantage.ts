import crypto from 'node:crypto';
import {
  signVerifiableDocument,
  verifyVerifiableDocument,
  getInstitutionalKeyPair,
} from '../../lib/crypto.js';

/**
 * Module 9: LTI 1.3 Advantage Protocol Engine
 * Standard-compliant integration for Canvas, Moodle, and Blackboard LMS.
 * Handles OIDC launch, JWT message validation, and AGS Grade Passback.
 */

export interface LtiResourceLinkLaunchPayload {
  iss: string;             // Issuer URL (e.g., https://canvas.instructure.com)
  aud: string;             // Client ID
  sub: string;             // Student User ID
  courseOfferingId: string;
  resourceLinkId: string;
  roles: string[];
  customParams?: Record<string, string>;
}

export interface AgsScorePayload {
  studentId: string;
  activityId: string;
  offeringId: string;
  scoreGiven: number;
  scoreMaximum: number;
  comment?: string;
  timestamp: string;
}

export class LtiAdvantageService {
  private platformIssuer = 'https://canvas.instructure.com';
  private platformClientId = 'client_lti_canvas_erp_101';

  /**
   * Validate incoming LTI 1.3 Launch JWT
   */
  validateLaunchMessage(jwtToken: string): { valid: boolean; payload?: LtiResourceLinkLaunchPayload; error?: string } {
    try {
      // In LTI 1.3 the launch JWT is signed by the LMS platform key. We must
      // reject unsigned tokens and validate the signature + registered claims.
      const parts = jwtToken.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Malformed LTI JWT structure' };
      }
      const [headerB64, payloadB64, signatureB64] = parts;

      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
        alg?: string;
      };
      if (!header.alg || header.alg.toLowerCase() === 'none') {
        return { valid: false, error: 'UNSIGNED_LTI_TOKEN: alg=none is not permitted' };
      }

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as
        LtiResourceLinkLaunchPayload & { aud?: string | string[]; exp?: number; iat?: number };

      if (!payload.sub || !payload.courseOfferingId) {
        return { valid: false, error: 'Missing mandatory LTI claims (sub or courseOfferingId)' };
      }

      const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!aud.includes(this.platformClientId)) {
        return {
          valid: false,
          error: 'INVALID_AUDIENCE: aud claim does not match the registered LTI client id',
        };
      }
      if (payload.iss !== this.platformIssuer) {
        return {
          valid: false,
          error: 'INVALID_ISSUER: iss claim does not match the registered LTI platform',
        };
      }
      if (typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000) {
        return { valid: false, error: 'EXPIRED_LTI_TOKEN: token has expired' };
      }
      if (typeof payload.iat === 'number' && payload.iat * 1000 > Date.now() + 60_000) {
        return { valid: false, error: 'INVALID_LTI_TOKEN: iat claim is in the future' };
      }

      // Verify the signature. Real deployments provide the platform key via
      // LTI_PLATFORM_PUBLIC_KEY (standard JWT signing input); otherwise fall
      // back to the institutional Ed25519 key used by the mock launch flow.
      const signedInput = `${headerB64}.${payloadB64}`;
      const platformKey = process.env.LTI_PLATFORM_PUBLIC_KEY;
      let signatureOk: boolean;
      if (platformKey) {
        const algorithm = header.alg === 'RS256' ? 'sha256' : null;
        try {
          signatureOk = crypto.verify(
            algorithm,
            Buffer.from(signedInput, 'utf8'),
            platformKey,
            Buffer.from(signatureB64, 'base64url')
          );
        } catch {
          signatureOk = false;
        }
      } else {
        signatureOk = verifyVerifiableDocument(
          { header: headerB64, body: payloadB64 },
          signatureB64,
          getInstitutionalKeyPair().publicKey
        );
      }

      if (!signatureOk) {
        return { valid: false, error: 'INVALID_LTI_SIGNATURE: token signature could not be verified' };
      }

      return { valid: true, payload };
    } catch {
      return { valid: false, error: 'Failed to decode LTI Launch message' };
    }
  }

  /**
   * Create mock launch token for testing
   */
  createMockLaunchToken(payload: LtiResourceLinkLaunchPayload): string {
    const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const { signature } = signVerifiableDocument({ header, body });
    return `${header}.${body}.${signature}`;
  }
}

export const ltiAdvantageService = new LtiAdvantageService();
