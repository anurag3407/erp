import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import { dynamicQrEngine } from './dynamicQrEngine.js';
import { geofenceService, type Coordinates } from './geofence.js';
import { webAuthnBindingService } from './webauthnService.js';
import type { AttendanceRecord } from '../../types/index.js';

/**
 * Module 2: Unified Anti-Proxy Attendance Marking Service
 * Orchestrates 10s rolling TOTP QR, 25m Haversine geofencing,
 * and WebAuthn biometric device binding into a single atomic verification pipeline.
 */

export interface MarkAttendanceRequest {
  studentId: string;
  offeringId: string;
  token: string;
  roomSecret: string;
  studentCoords: Coordinates;
  classroomCoords: Coordinates;
  maxRadiusMeters?: number;
  credentialId?: string;
  clientDataJSON?: string;
  biometricSignature?: string;
  timestampMs?: number;
}

export interface MarkAttendanceResult {
  success: boolean;
  recordId?: string;
  status: 'PRESENT' | 'REJECTED';
  distanceMeters: number;
  error?: string;
}

export class AttendanceService {
  /**
   * Atomically mark attendance after verifying dynamic QR, geofence, and WebAuthn
   */
  async markAttendance(req: MarkAttendanceRequest): Promise<MarkAttendanceResult> {
    const now = req.timestampMs || Date.now();

    // 1. Dynamic QR Token Verification (10-second rolling window)
    const qrCheck = dynamicQrEngine.verifyToken(req.offeringId, req.token, req.roomSecret, now);
    if (!qrCheck.valid) {
      return {
        success: false,
        status: 'REJECTED',
        distanceMeters: 0,
        error: qrCheck.reason || 'DYNAMIC_QR_INVALID: Token expired or invalid for current time step',
      };
    }

    // 2. Haversine Geofence Verification (25-meter classroom radius)
    const maxRadius = req.maxRadiusMeters ?? 25;
    const geoCheck = geofenceService.validateClassroomGeofence(req.studentCoords, req.classroomCoords, maxRadius);
    if (!geoCheck.isWithinBounds) {
      return {
        success: false,
        status: 'REJECTED',
        distanceMeters: geoCheck.distanceMeters,
        error: `OUT_OF_BOUNDS: Student is ${geoCheck.distanceMeters}m away (exceeds ${maxRadius}m limit)`,
      };
    }

    // 3. WebAuthn Biometric Hardware Binding (if provided)
    if (req.credentialId && req.clientDataJSON && req.biometricSignature) {
      const bioCheck = await webAuthnBindingService.verifyBiometricAssertion(
        req.studentId,
        req.credentialId,
        req.clientDataJSON,
        req.biometricSignature
      );
      if (!bioCheck.verified) {
        return {
          success: false,
          status: 'REJECTED',
          distanceMeters: geoCheck.distanceMeters,
          error: bioCheck.error || 'BIOMETRIC_FAILED: Hardware biometric verification failed',
        };
      }
    }

    // 4. Duplicate Check: Prevent marking multiple times for the same lecture session on the same day
    const sessionDateStr = new Date(now).toISOString().split('T')[0];
    const duplicate = (await db.attendanceRecords.values()).find(
      (r) =>
        r.studentId === req.studentId &&
        r.offeringId === req.offeringId &&
        r.timestamp.toISOString().split('T')[0] === sessionDateStr
    );
    if (duplicate) {
      return {
        success: true,
        recordId: duplicate.id,
        status: 'PRESENT',
        distanceMeters: geoCheck.distanceMeters,
      };
    }

    // 5. Record Attendance in Database
    const recordId = `att-${crypto.randomUUID()}`;
    const newRecord: AttendanceRecord = {
      id: recordId,
      studentId: req.studentId,
      offeringId: req.offeringId,
      timestamp: new Date(now),
      status: 'PRESENT',
      verificationMethod: req.credentialId ? 'WEBAUTHN' : 'DYNAMIC_QR',
      latitude: req.studentCoords.latitude,
      longitude: req.studentCoords.longitude,
      distanceMeters: geoCheck.distanceMeters,
      deviceId: req.credentialId,
    };
    await db.attendanceRecords.set(recordId, newRecord);

    return {
      success: true,
      recordId,
      status: 'PRESENT',
      distanceMeters: geoCheck.distanceMeters,
    };
  }
}

export const attendanceService = new AttendanceService();
