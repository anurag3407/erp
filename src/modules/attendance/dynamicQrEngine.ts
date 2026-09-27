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
  private stepSeconds: number;
  private allowedDriftSteps: number;

  constructor(stepSeconds?: number, allowedDriftSteps: number = 0) {
    this.stepSeconds =
      stepSeconds ??
      (process.env.ATTENDANCE_QR_STEP_SECONDS
        ? parseInt(process.env.ATTENDANCE_QR_STEP_SECONDS, 10)
        : 10);
    this.allowedDriftSteps = allowedDriftSteps;
  }

  setStepSeconds(seconds: number, allowedDriftSteps: number = 0) {
    this.stepSeconds = seconds;
    this.allowedDriftSteps = allowedDriftSteps;
  }

  getStepSeconds(): number {
    return this.stepSeconds;
  }

  /**
   * Generate current rolling dynamic QR code payload for classroom projection
   */
  generateCurrentQr(
    offeringId: string,
    roomSecret: string,
    timestampMs: number = Date.now(),
    stepSecondsOverride?: number
  ): DynamicQrPayload {
    const step = stepSecondsOverride ?? this.stepSeconds;
    const { token, timeStep, expiresAtMs } = generateRollingAttendanceToken(
      offeringId,
      roomSecret,
      timestampMs,
      step
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
   */
  verifyToken(
    offeringId: string,
    token: string,
    roomSecret: string,
    submissionTimestampMs: number = Date.now(),
    stepSecondsOverride?: number,
    allowedDriftOverride?: number
  ): { valid: boolean; reason?: string } {
    const step = stepSecondsOverride ?? this.stepSeconds;
    const drift = allowedDriftOverride ?? this.allowedDriftSteps;

    const result = verifyRollingAttendanceToken(
      offeringId,
      token,
      roomSecret,
      submissionTimestampMs,
      step,
      drift
    );

    if (!result.valid) {
      return {
        valid: false,
        reason: `EXPIRED_QR_TOKEN: Dynamic QR token expired (${step}s lifetime exceeded) or invalid`,
      };
    }

    return { valid: true };
  }
}

export const dynamicQrEngine = new DynamicQrEngine();
