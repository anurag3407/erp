import crypto from 'node:crypto';
import { db, withTransaction } from '../../lib/db.js';
import { toIstDateKey } from '../../lib/time.js';

/**
 * UGC & State Statutory Attendance Rules:
 * - 75.0% minimum attendance required to appear in end-semester examinations.
 * - 65.0% - 74.9%: Shortfall eligible for Condonation on approved grounds (medical/sports/OD) with syndicate approval and fee.
 * - <65.0%: Detained (ineligible for end-sem examination without repeating).
 */
export const UGC_MIN_ATTENDANCE_PCT = 75.0;
export const UGC_CONDONATION_MIN_PCT = 65.0;

export interface OfferingAttendanceSummary {
  offeringId: string;
  studentId: string;
  totalLecturesConducted: number;
  attendedLectures: number;
  attendancePercentage: number;
  isEligibleForExams: boolean;
  isCondonationEligible: boolean;
  isDetained: boolean;
}

export interface UgcShortageReport {
  offeringId: string;
  generatedAt: string;
  totalStudents: number;
  shortageCount: number;
  detainedCount: number;
  condonationEligibleCount: number;
  shortageList: OfferingAttendanceSummary[];
}

export interface CondonationRequest {
  id: string;
  studentId: string;
  offeringId: string;
  currentAttendancePercentage: number;
  reason: 'MEDICAL' | 'SPORTS' | 'ON_DUTY_APPROVED' | 'BEREAVEMENT';
  documentProofUri?: string;
  condonationFeePaid: boolean;
  condonationFeeTxId?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  approvedAt?: Date;
  effectiveAttendancePercentage?: number;
}

export class AttendanceAnalyticsService {
  /**
   * Compute subject-wise attendance percentage and UGC exam eligibility for a student
   */
  async computeAttendanceSummary(
    studentId: string,
    offeringId: string
  ): Promise<OfferingAttendanceSummary> {
    const allRecords = await db.attendanceRecords.values();
    const offeringRecords = allRecords.filter((r) => r.offeringId === offeringId);

    // Group conducted lectures by distinct session or day+period
    const sessionKeys = new Set<string>();
    for (const r of offeringRecords) {
      if (r.sessionId) {
        sessionKeys.add(`s:${r.sessionId}`);
      } else if (r.periodNumber != null) {
        sessionKeys.add(`p:${toIstDateKey(r.timestamp)}:${r.periodNumber}`);
      } else {
        sessionKeys.add(`d:${toIstDateKey(r.timestamp)}`);
      }
    }

    const totalLecturesConducted = Math.max(1, sessionKeys.size);

    // Count student's attended sessions
    const studentRecords = offeringRecords.filter(
      (r) => r.studentId === studentId && r.status === 'PRESENT'
    );
    const attendedKeys = new Set<string>();
    for (const r of studentRecords) {
      if (r.sessionId) {
        attendedKeys.add(`s:${r.sessionId}`);
      } else if (r.periodNumber != null) {
        attendedKeys.add(`p:${toIstDateKey(r.timestamp)}:${r.periodNumber}`);
      } else {
        attendedKeys.add(`d:${toIstDateKey(r.timestamp)}`);
      }
    }

    const attendedLectures = attendedKeys.size;
    const attendancePercentage =
      Math.round((attendedLectures / totalLecturesConducted) * 10000) / 100;

    const isEligibleForExams = attendancePercentage >= UGC_MIN_ATTENDANCE_PCT;
    const isCondonationEligible =
      attendancePercentage >= UGC_CONDONATION_MIN_PCT && !isEligibleForExams;
    const isDetained = attendancePercentage < UGC_CONDONATION_MIN_PCT;

    return {
      offeringId,
      studentId,
      totalLecturesConducted,
      attendedLectures,
      attendancePercentage,
      isEligibleForExams,
      isCondonationEligible,
      isDetained,
    };
  }

  /**
   * Generate Statutory 75% UGC Attendance Shortage & Detention Report for an offering
   */
  async generateUgcShortageReport(offeringId: string): Promise<UgcShortageReport> {
    // Collect enrolled students
    const enrollments = (await db.enrollments.values()).filter(
      (e) => e.offeringId === offeringId && e.status === 'CONFIRMED'
    );

    const summaries: OfferingAttendanceSummary[] = [];
    for (const enr of enrollments) {
      const summary = await this.computeAttendanceSummary(enr.studentId, offeringId);
      summaries.push(summary);
    }

    const shortageList = summaries.filter((s) => !s.isEligibleForExams);
    const condonationEligibleCount = shortageList.filter((s) => s.isCondonationEligible).length;
    const detainedCount = shortageList.filter((s) => s.isDetained).length;

    return {
      offeringId,
      generatedAt: new Date().toISOString(),
      totalStudents: summaries.length,
      shortageCount: shortageList.length,
      detainedCount,
      condonationEligibleCount,
      shortageList,
    };
  }

  /**
   * Submit a Condonation Request for students between 65% and 74.9%
   */
  async requestCondonation(data: {
    studentId: string;
    offeringId: string;
    reason: 'MEDICAL' | 'SPORTS' | 'ON_DUTY_APPROVED' | 'BEREAVEMENT';
    documentProofUri?: string;
    condonationFeeTxId?: string;
  }): Promise<CondonationRequest> {
    const summary = await this.computeAttendanceSummary(data.studentId, data.offeringId);
    if (summary.isEligibleForExams) {
      throw new Error('CONDONATION_NOT_REQUIRED: Student already meets the 75% UGC requirement');
    }
    if (summary.isDetained) {
      throw new Error(
        `CONDONATION_INELIGIBLE: Attendance (${summary.attendancePercentage}%) is below statutory 65% condonation floor`
      );
    }

    const id = `cond-${crypto.randomUUID()}`;
    const req: CondonationRequest = {
      id,
      studentId: data.studentId,
      offeringId: data.offeringId,
      currentAttendancePercentage: summary.attendancePercentage,
      reason: data.reason,
      documentProofUri: data.documentProofUri,
      condonationFeePaid: Boolean(data.condonationFeeTxId),
      condonationFeeTxId: data.condonationFeeTxId,
      status: 'PENDING',
    };

    return req;
  }
}

export const attendanceAnalyticsService = new AttendanceAnalyticsService();
