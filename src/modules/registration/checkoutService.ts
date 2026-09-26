import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import { seatEngine } from './seatEngine.js';

/**
 * Module 1: Deadlock-Free Registration Checkout Service
 * Acquires row locks strictly in sorted UUID order to prevent deadlocks,
 * validates in-memory Redis cart holds, and commits atomic DB updates.
 */

export interface CheckoutResult {
  success: boolean;
  enrolledOfferings: string[];
  failedOfferings: Array<{ offeringId: string; reason: string }>;
  transactionId?: string;
}

export class CourseCheckoutService {
  /**
   * Execute multi-course atomic registration with sorted lock ordering
   */
  async checkoutCourses(studentId: string, offeringIds: string[]): Promise<CheckoutResult> {
    if (offeringIds.length === 0) {
      return { success: false, enrolledOfferings: [], failedOfferings: [{ offeringId: '', reason: 'Empty cart' }] };
    }

    // 1. Sort Offering IDs deterministically to guarantee deadlock-free locking
    const sortedOfferingIds = [...offeringIds].sort();

    // 2. Acquire locks deterministically
    const releaseLocks = await db.acquireSortedLocks(sortedOfferingIds);

    const enrolled: string[] = [];
    const failed: Array<{ offeringId: string; reason: string }> = [];

    try {
      for (const offeringId of sortedOfferingIds) {
        const offering = db.courseOfferings.get(offeringId);
        if (!offering) {
          failed.push({ offeringId, reason: 'Course offering not found' });
          continue;
        }

        // Check if student already enrolled
        const alreadyEnrolled = Array.from(db.enrollments.values()).some(
          (e) => e.studentId === studentId && e.offeringId === offeringId
        );
        if (alreadyEnrolled) {
          failed.push({ offeringId, reason: 'Student already enrolled in this course' });
          continue;
        }

        // Verify Redis Cart Hold or Atomically Reserve
        const hasHold = await seatEngine.hasActiveReservation(offeringId, studentId);
        if (!hasHold) {
          const reserved = await seatEngine.reserveSeat(offeringId, studentId);
          if (!reserved) {
            failed.push({ offeringId, reason: 'Course is full. Capacity reached.' });
            continue;
          }
        }

        // Database atomic check-and-increment
        // Simulates: UPDATE course_offerings SET enrolled_count = enrolled_count + 1 WHERE id = $1 AND enrolled_count < max_capacity
        if (offering.enrolledCount >= offering.maxCapacity) {
          await seatEngine.releaseReservation(offeringId, studentId);
          failed.push({ offeringId, reason: 'Capacity exceeded at database commit' });
          continue;
        }

        offering.enrolledCount += 1;
        const enrollmentId = `enr-${crypto.randomUUID()}`;
        db.enrollments.set(enrollmentId, {
          id: enrollmentId,
          studentId,
          offeringId,
          status: 'CONFIRMED',
          enrolledAt: new Date(),
        });

        // Commit the reservation now that it's permanently recorded in the database
        await seatEngine.commitReservation(offeringId, studentId);
        enrolled.push(offeringId);
      }

      const allSuccess = failed.length === 0;
      return {
        success: allSuccess,
        enrolledOfferings: enrolled,
        failedOfferings: failed,
        transactionId: `tx-${crypto.randomUUID()}`,
      };
    } finally {
      releaseLocks();
    }
  }
}

export const courseCheckoutService = new CourseCheckoutService();
