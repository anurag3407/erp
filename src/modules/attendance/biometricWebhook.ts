import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';

/**
 * Module 2: Hardware Biometric Turnstile & RFID Webhook Processor
 * Ingests physical gate check-in events with Redis-backed deduplication.
 */

export interface BiometricEventPayload {
  turnstileId: string;
  studentRollNumber: string;
  timestamp: string; // ISO 8601
  doorLocation: string;
  direction: 'ENTRY' | 'EXIT';
  biometricMatchConfidence: number; // 0.0 - 1.0
}

export class BiometricWebhookProcessor {
  /**
   * Process incoming turnstile/biometric hardware event
   */
  async processEvent(event: BiometricEventPayload): Promise<{ success: boolean; deduplicated: boolean; recordId?: string; error?: string }> {
    // 1. Deduplication key: prevent double-punch within 60 seconds
    const eventTimeMs = new Date(event.timestamp).getTime();
    const windowMinute = Math.floor(eventTimeMs / 60000);
    const dedupKey = `turnstile:dedup:${event.studentRollNumber}:${event.turnstileId}:${windowMinute}`;
    const lockKey = `lock:turnstile:${event.studentRollNumber}:${event.turnstileId}:${windowMinute}`;

    const acquired = await redis.acquireLock(lockKey, 'turnstile-worker', 5000);
    if (!acquired) {
      return { success: true, deduplicated: true };
    }

    try {
      const alreadyProcessed = await redis.get(dedupKey);
      if (alreadyProcessed) {
        return { success: true, deduplicated: true };
      }

      // 2. Find student profile by roll number
      const student = (await db.studentProfiles.values()).find(
        (s) => s.rollNumber === event.studentRollNumber
      );

      if (!student) {
        return { success: false, deduplicated: false, error: 'STUDENT_NOT_FOUND' };
      }

      // 3. Low confidence check
      if (event.biometricMatchConfidence < 0.85) {
        return {
          success: false,
          deduplicated: false,
          error: 'LOW_CONFIDENCE_REJECTED: Biometric match below 85% threshold',
        };
      }

      // Lock and set deduplication key for 120s
      await redis.setex(dedupKey, 120, '1');

      // 4. Record attendance
      const recordId = `att-bio-${crypto.randomUUID()}`;
      await db.attendanceRecords.set(recordId, {
        id: recordId,
        studentId: student.id,
        offeringId: 'CAMPUS_GATE',
        timestamp: new Date(event.timestamp),
        status: 'PRESENT',
        verificationMethod: 'RFID',
        deviceId: event.turnstileId,
      });

      return { success: true, deduplicated: false, recordId };
    } finally {
      await redis.releaseLock(lockKey, 'turnstile-worker');
    }
  }
}

export const biometricWebhookProcessor = new BiometricWebhookProcessor();
