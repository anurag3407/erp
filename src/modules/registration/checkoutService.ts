import crypto from 'node:crypto';
import { db, withTransaction } from '../../lib/db.js';
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

    // Lazily load enrollments only once a reservation succeeds — this keeps the
    // hot rejection path (course full) entirely in Redis with zero DB round-trips.
    let existingEnrollments: Awaited<ReturnType<typeof db.enrollments.values>> | null = null;

    try {
      for (const offeringId of sortedOfferingIds) {
        // 1. Gate on the atomic Redis seat reservation FIRST (fast rejection).
        //    Only requests that actually win a seat touch the database.
        const hasHold = await seatEngine.hasActiveReservation(offeringId, studentId);
        if (!hasHold) {
          const reserved = await seatEngine.reserveSeat(offeringId, studentId);
          if (!reserved) {
            failed.push({ offeringId, reason: 'Course is full. Capacity reached.' });
            continue;
          }
        }

        // 2. Now the (rare) DB-backed validations run for reservation winners.
        const offering = await db.courseOfferings.get(offeringId);
        if (!offering) {
          await seatEngine.releaseReservation(offeringId, studentId);
          failed.push({ offeringId, reason: 'Course offering not found' });
          continue;
        }

        if (!existingEnrollments) {
          existingEnrollments = await db.enrollments.values();
        }
        const alreadyEnrolled = existingEnrollments.some(
          (e) => e.studentId === studentId && e.offeringId === offeringId
        );
        if (alreadyEnrolled) {
          await seatEngine.releaseReservation(offeringId, studentId);
          failed.push({ offeringId, reason: 'Student already enrolled in this course' });
          continue;
        }

        // Atomic check-and-increment at the database level plus the enrollment
        // insert happen in ONE transaction, so we never increment a seat
        // without recording the enrollment (or vice versa).
        const enrollmentId = `enr-${crypto.randomUUID()}`;
        const committed = await withTransaction(async (tx, exec) => {
          const updated = await exec.unsafe<{ enrolled_count: number }[]>(
            `update course_offerings
                set enrolled_count = enrolled_count + 1
              where id = $1 and enrolled_count < max_capacity
              returning enrolled_count`,
            [offeringId]
          );
          if (updated.length === 0) return false;

          await tx.enrollments.set(enrollmentId, {
            id: enrollmentId,
            studentId,
            offeringId,
            status: 'CONFIRMED',
            enrolledAt: new Date(),
          });
          return true;
        });

        if (!committed) {
          await seatEngine.releaseReservation(offeringId, studentId);
          failed.push({ offeringId, reason: 'Capacity exceeded at database commit' });
          continue;
        }

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
