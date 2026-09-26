import { generateRollingAttendanceToken, verifyRollingAttendanceToken } from '../../lib/crypto.js';

/**
 * Module 2: Anti-Proxy 10-Second Rolling TOTP QR Attendance Engine
 * Emits rolling cryptographic tokens updated every 10 seconds.
 * Invalidates screenshots and forwarded QR codes.
 */

export interface DynamicQrPayload {
  offeringId: string;
  token: string;
  timeStep: number;
  expiresAtMs: number;
  remainingMs: number;
  qrPayloadString: string;
}

export class DynamicQrEngine {
  private stepSeconds = 10;

  /**
   * Generate current rolling dynamic QR code payload for classroom projection
   */
  generateCurrentQr(offeringId: string, roomSecret: string, timestampMs: number = Date.now()): DynamicQrPayload {
    const { token, timeStep, expiresAtMs } = generateRollingAttendanceToken(
      offeringId,
      roomSecret,
      timestampMs,
      this.stepSeconds
    );
    const remainingMs = Math.max(0, expiresAtMs - timestampMs);

    // Formatted payload encoded into the dynamic QR
    const qrPayloadString = JSON.stringify({
      offeringId,
      t: token,
      step: timeStep,
      exp: expiresAtMs,
    });

    return {
      offeringId,
      token,
      timeStep,
      expiresAtMs,
      remainingMs,
      qrPayloadString,
    };
  }

  /**
   * Verify dynamic QR token submitted by student PWA
   * Strictly enforces 10-second validity (rejects tokens from past/future steps)
   */
  verifyToken(
    offeringId: string,
    token: string,
    roomSecret: string,
    submissionTimestampMs: number = Date.now()
  ): { valid: boolean; reason?: string } {
    const result = verifyRollingAttendanceToken(
      offeringId,
      token,
      roomSecret,
      submissionTimestampMs,
      this.stepSeconds,
      0 // 0 drift: strict 10-second validity
    );

    if (!result.valid) {
      return {
        valid: false,
        reason: 'EXPIRED_QR_TOKEN: Dynamic QR token expired (10s lifetime exceeded) or invalid',
      };
    }

    return { valid: true };
  }
}

export const dynamicQrEngine = new DynamicQrEngine();
