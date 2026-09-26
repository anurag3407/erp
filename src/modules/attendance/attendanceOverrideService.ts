import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import type {
  AttendanceRecord,
  AttendanceOverrideReasonCode,
  AttendanceOverrideAuditLog,
  UserRole,
} from '../../types/index.js';

export interface OverrideAttendanceRequest {
  attendanceRecordId: string;
  newStatus: 'PRESENT' | 'ABSENT' | 'OUT_OF_BOUNDS' | 'PROXY_ATTEMPT_REJECTED';
  reasonCode: AttendanceOverrideReasonCode;
  reasonDescription: string;
  modifiedByUserId: string;
  modifiedByRole: UserRole;
  linkedLeaveApplicationId?: string;
}

export interface OverrideResult {
  success: boolean;
  previousStatus: string;
  updatedRecord: AttendanceRecord;
  auditLog: AttendanceOverrideAuditLog;
}

export class AttendanceOverrideService {
  private static AUTHORIZED_ROLES: UserRole[] = ['SUPER_ADMIN', 'REGISTRAR', 'DEAN', 'HOD', 'FACULTY'];

  /**
   * Override a single attendance record with reason code and audit logging
   */
  async overrideAttendance(req: OverrideAttendanceRequest): Promise<OverrideResult> {
    // 1. Authorization check
    if (!AttendanceOverrideService.AUTHORIZED_ROLES.includes(req.modifiedByRole)) {
      throw new Error(`UNAUTHORIZED: Role ${req.modifiedByRole} is not permitted to override attendance`);
    }

    if (!req.reasonDescription || req.reasonDescription.trim() === '') {
      throw new Error('Reason description is mandatory for attendance overrides');
    }

    // 2. Fetch existing attendance record
    const record = await db.attendanceRecords.get(req.attendanceRecordId);
    if (!record) {
      throw new Error(`Attendance record not found: ${req.attendanceRecordId}`);
    }

    const previousStatus = record.status;

    // 3. Optional Leave Validation
    if (req.linkedLeaveApplicationId) {
      const leave = await db.leaveApplications.get(req.linkedLeaveApplicationId);
      if (!leave) {
        throw new Error(`Linked leave application not found: ${req.linkedLeaveApplicationId}`);
      }
      if (leave.status !== 'APPROVED') {
        throw new Error(`Cannot link unapproved leave application (status: ${leave.status})`);
      }
      if (leave.applicantId !== record.studentId) {
        throw new Error('Leave application applicant does not match attendance record student');
      }
    }

    // 4. Update attendance record
    record.status = req.newStatus;
    record.verificationMethod = 'MANUAL';

    // 5. Create immutable audit log entry
    const logId = `att-log-${crypto.randomUUID()}`;
    const auditLog: AttendanceOverrideAuditLog = {
      id: logId,
      attendanceRecordId: record.id,
      studentId: record.studentId,
      offeringId: record.offeringId,
      previousStatus,
      newStatus: req.newStatus,
      reasonCode: req.reasonCode,
      reasonDescription: req.reasonDescription,
      modifiedByUserId: req.modifiedByUserId,
      modifiedByRole: req.modifiedByRole,
      linkedLeaveApplicationId: req.linkedLeaveApplicationId,
      timestamp: new Date(),
    };

    await db.attendanceRecords.set(record.id, record);
    await db.attendanceOverrideAuditLogs.set(logId, auditLog);

    return {
      success: true,
      previousStatus,
      updatedRecord: record,
      auditLog,
    };
  }

  /**
   * Automatically apply attendance overrides for an approved leave application
   * Updates all attendance records within the leave date range for the applicant student.
   */
  async applyApprovedLeaveOverride(
    leaveApplicationId: string,
    performedByUserId: string,
    performedByRole: UserRole
  ): Promise<{ processedCount: number; auditLogs: AttendanceOverrideAuditLog[] }> {
    // 1. Authorization check
    if (!AttendanceOverrideService.AUTHORIZED_ROLES.includes(performedByRole)) {
      throw new Error(`UNAUTHORIZED: Role ${performedByRole} is not permitted to override attendance`);
    }

    const leave = await db.leaveApplications.get(leaveApplicationId);
    if (!leave) {
      throw new Error(`Leave application not found: ${leaveApplicationId}`);
    }

    if (leave.applicantType !== 'STUDENT') {
      throw new Error('Cannot apply student attendance override for non-student applicant');
    }

    if (leave.status !== 'APPROVED') {
      throw new Error(`Cannot apply override for unapproved leave (status: ${leave.status})`);
    }

    const reasonCode: AttendanceOverrideReasonCode = leave.isOnDuty
      ? 'ON_DUTY_APPROVED'
      : leave.leaveType === 'MEDICAL'
      ? 'MEDICAL_LEAVE'
      : 'OFFICIAL_DUTY_EXEMPTION';

    const matchingRecords = (await db.attendanceRecords.values()).filter((rec) => {
      if (rec.studentId !== leave.applicantId) return false;
      const recDateStr = rec.timestamp.toISOString().split('T')[0];
      const inRange = recDateStr >= leave.startDate && recDateStr <= leave.endDate;
      return inRange && rec.status !== 'PRESENT';
    });

    const auditLogs: AttendanceOverrideAuditLog[] = [];

    for (const rec of matchingRecords) {
      const result = await this.overrideAttendance({
        attendanceRecordId: rec.id,
        newStatus: 'PRESENT',
        reasonCode,
        reasonDescription: `Approved Leave: ${leave.reason} (${leave.leaveType})`,
        modifiedByUserId: performedByUserId,
        modifiedByRole: performedByRole,
        linkedLeaveApplicationId: leave.id,
      });
      auditLogs.push(result.auditLog);
    }

    return {
      processedCount: matchingRecords.length,
      auditLogs,
    };
  }

  /**
   * Retrieve full audit history for an attendance record
   */
  async getAuditHistory(attendanceRecordId: string): Promise<AttendanceOverrideAuditLog[]> {
    return (await db.attendanceOverrideAuditLogs.values())
      .filter((log) => log.attendanceRecordId === attendanceRecordId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Retrieve audit logs by student
   */
  async getAuditHistoryForStudent(studentId: string): Promise<AttendanceOverrideAuditLog[]> {
    return (await db.attendanceOverrideAuditLogs.values())
      .filter((log) => log.studentId === studentId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

export const attendanceOverrideService = new AttendanceOverrideService();
