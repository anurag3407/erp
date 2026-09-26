import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import { validateTemporalExclusion } from '../timetable/temporalExclusion.js';
import type {
  LeaveApplication,
  LeaveType,
  ApplicantType,
  LeaveStatus,
  OnDutyPass,
  TimetableSlot,
} from '../../types/index.js';

export interface ApplyStudentLeaveRequest {
  studentId: string;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason: string;
  isOnDuty?: boolean;
  onDutyEventName?: string;
}

export interface ApplyFacultyLeaveRequest {
  facultyId: string;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason: string;
  substituteFacultyId: string;
}

export class LeaveService {
  /**
   * Apply for student leave (Casual, Medical, or On-Duty)
   * Automatically routes to mentor for first-level review
   */
  applyStudentLeave(req: ApplyStudentLeaveRequest): LeaveApplication {
    if (new Date(req.startDate) > new Date(req.endDate)) {
      throw new Error('INVALID_DATES: Leave start date must precede or equal end date');
    }

    const student = db.studentProfiles.get(req.studentId);
    if (!student) {
      throw new Error(`Student not found: ${req.studentId}`);
    }

    const leaveId = `leave-${crypto.randomUUID()}`;
    const isOnDuty = req.leaveType === 'ON_DUTY' || !!req.isOnDuty;

    const application: LeaveApplication = {
      id: leaveId,
      applicantId: req.studentId,
      applicantType: 'STUDENT',
      leaveType: req.leaveType,
      startDate: req.startDate,
      endDate: req.endDate,
      reason: req.reason,
      status: student.mentorId ? 'PENDING_MENTOR' : 'PENDING_HOD',
      isOnDuty,
      onDutyEventName: isOnDuty ? req.onDutyEventName || 'Institutional Academic Event' : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.leaveApplications.set(leaveId, application);
    return application;
  }

  /**
   * Apply for faculty leave with substitute faculty assignment.
   * Performs timetable conflict check via validateTemporalExclusion.
   */
  applyFacultyLeave(req: ApplyFacultyLeaveRequest): LeaveApplication {
    if (new Date(req.startDate) > new Date(req.endDate)) {
      throw new Error('INVALID_DATES: Leave start date must precede or equal end date');
    }

    const faculty = db.users.get(req.facultyId);
    if (!faculty || faculty.role !== 'FACULTY') {
      throw new Error(`Valid faculty not found: ${req.facultyId}`);
    }

    const substitute = db.users.get(req.substituteFacultyId);
    if (!substitute || substitute.role !== 'FACULTY') {
      throw new Error(`Valid substitute faculty not found: ${req.substituteFacultyId}`);
    }

    if (req.facultyId === req.substituteFacultyId) {
      throw new Error('Substitute faculty cannot be the same as the applicant faculty');
    }

    const reqStart = new Date(req.startDate).getTime();
    const reqEnd = new Date(req.endDate).getTime();

    // 1. Check if substitute faculty is already on leave during overlapping dates
    for (const otherApp of db.leaveApplications.values()) {
      if (
        otherApp.applicantId === req.substituteFacultyId &&
        otherApp.applicantType === 'FACULTY' &&
        (otherApp.status === 'APPROVED' || otherApp.status === 'PENDING_HOD')
      ) {
        const oStart = new Date(otherApp.startDate).getTime();
        const oEnd = new Date(otherApp.endDate).getTime();
        if (Math.max(reqStart, oStart) <= Math.min(reqEnd, oEnd)) {
          throw new Error(
            `SUBSTITUTE_ON_LEAVE: Substitute faculty ${substitute.name} is on leave from ${otherApp.startDate} to ${otherApp.endDate}`
          );
        }
      }
    }

    // 2. Timetable Conflict Check via validateTemporalExclusion against permanent slots
    const facultySlots = Array.from(db.timetableSlots.values()).filter(
      (slot) => slot.facultyId === req.facultyId
    );
    const substituteSlots = Array.from(db.timetableSlots.values()).filter(
      (slot) => slot.facultyId === req.substituteFacultyId
    );

    for (const slot of facultySlots) {
      // Map slot to substitute faculty candidate slot
      const candidateSlot: TimetableSlot = {
        ...slot,
        id: `candidate-${slot.id}`,
        facultyId: req.substituteFacultyId,
      };

      const check = validateTemporalExclusion(candidateSlot, substituteSlots);
      if (!check.valid) {
        throw new Error(
          `TIMETABLE_CONFLICT: Substitute faculty ${substitute.name} has a conflicting lecture slot on Day ${slot.dayOfWeek} at ${slot.startTime}-${slot.endTime}`
        );
      }
    }

    // 3. Check if substitute is already assigned to another faculty's overlapping leave with colliding slots
    for (const otherApp of db.leaveApplications.values()) {
      if (
        otherApp.substituteFacultyId === req.substituteFacultyId &&
        otherApp.applicantId !== req.facultyId &&
        (otherApp.status === 'APPROVED' || otherApp.status === 'PENDING_HOD')
      ) {
        const oStart = new Date(otherApp.startDate).getTime();
        const oEnd = new Date(otherApp.endDate).getTime();
        if (Math.max(reqStart, oStart) <= Math.min(reqEnd, oEnd)) {
          const otherFacultySlots = Array.from(db.timetableSlots.values()).filter(
            (slot) => slot.facultyId === otherApp.applicantId
          );
          for (const slot of facultySlots) {
            const candidateSlot: TimetableSlot = {
              ...slot,
              id: `candidate-dup-${slot.id}`,
              facultyId: req.substituteFacultyId,
            };
            const check = validateTemporalExclusion(candidateSlot, otherFacultySlots);
            if (!check.valid) {
              throw new Error(
                `SUBSTITUTE_CONFLICT: Substitute faculty ${substitute.name} is already assigned to cover conflicting lecture on Day ${slot.dayOfWeek} at ${slot.startTime}-${slot.endTime}`
              );
            }
          }
        }
      }
    }

    const leaveId = `leave-${crypto.randomUUID()}`;
    const application: LeaveApplication = {
      id: leaveId,
      applicantId: req.facultyId,
      applicantType: 'FACULTY',
      leaveType: req.leaveType,
      startDate: req.startDate,
      endDate: req.endDate,
      reason: req.reason,
      status: 'PENDING_HOD',
      substituteFacultyId: req.substituteFacultyId,
      substituteApproved: true,
      isOnDuty: req.leaveType === 'ACADEMIC_DUTY' || req.leaveType === 'ON_DUTY',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.leaveApplications.set(leaveId, application);
    return application;
  }

  /**
   * Mentor review step for student leave
   */
  approveByMentor(leaveId: string, mentorUserId: string, comments?: string): LeaveApplication {
    const app = db.leaveApplications.get(leaveId);
    if (!app) {
      throw new Error(`Leave application not found: ${leaveId}`);
    }

    if (app.status !== 'PENDING_MENTOR') {
      throw new Error(`Leave application is not in PENDING_MENTOR status (current: ${app.status})`);
    }

    app.mentorApprovalId = mentorUserId;
    app.mentorApprovedAt = new Date();
    app.status = 'PENDING_HOD';
    app.updatedAt = new Date();

    return app;
  }

  /**
   * HOD final approval step
   * If leave is On-Duty (OD), automatically generates On-Duty Pass
   */
  approveByHod(leaveId: string, hodUserId: string): { application: LeaveApplication; onDutyPass?: OnDutyPass } {
    const app = db.leaveApplications.get(leaveId);
    if (!app) {
      throw new Error(`Leave application not found: ${leaveId}`);
    }

    if (app.status !== 'PENDING_HOD') {
      throw new Error(`Leave application is not awaiting HOD approval (current: ${app.status})`);
    }

    app.hodApprovalId = hodUserId;
    app.hodApprovedAt = new Date();
    app.status = 'APPROVED';
    app.updatedAt = new Date();

    let onDutyPass: OnDutyPass | undefined;

    if (app.isOnDuty && app.applicantType === 'STUDENT') {
      const passNumber = `OD-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      app.onDutyPassNumber = passNumber;

      onDutyPass = {
        id: `od-pass-${crypto.randomUUID()}`,
        leaveApplicationId: app.id,
        studentId: app.applicantId,
        eventName: app.onDutyEventName || 'Official Academic / Sports Representation',
        startDate: app.startDate,
        endDate: app.endDate,
        passNumber,
        isVerified: true,
        issuedAt: new Date(),
      };

      db.onDutyPasses.set(passNumber, onDutyPass);
    }

    return { application: app, onDutyPass };
  }

  /**
   * Reject leave application
   */
  rejectLeave(leaveId: string, rejectionReason: string): LeaveApplication {
    const app = db.leaveApplications.get(leaveId);
    if (!app) {
      throw new Error(`Leave application not found: ${leaveId}`);
    }

    app.status = 'REJECTED';
    app.rejectionReason = rejectionReason;
    app.updatedAt = new Date();

    return app;
  }

  /**
   * Cancel an existing leave application (student or faculty).
   * Revokes any generated On-Duty pass and frees up substitute faculty.
   */
  cancelLeave(
    leaveId: string,
    cancelledByUserId: string,
    reason?: string
  ): { application: LeaveApplication; revokedOnDutyPass?: OnDutyPass } {
    const app = db.leaveApplications.get(leaveId);
    if (!app) {
      throw new Error(`Leave application not found: ${leaveId}`);
    }

    if (app.status === 'CANCELLED') {
      throw new Error(`Leave application ${leaveId} is already cancelled`);
    }

    if (app.status === 'REJECTED') {
      throw new Error(`Cannot cancel an already rejected leave application: ${leaveId}`);
    }

    app.status = 'CANCELLED';
    app.rejectionReason = reason || `Cancelled by user ${cancelledByUserId}`;
    app.updatedAt = new Date();

    let revokedPass: OnDutyPass | undefined;
    if (app.onDutyPassNumber) {
      const pass = db.onDutyPasses.get(app.onDutyPassNumber);
      if (pass) {
        pass.isVerified = false;
        revokedPass = pass;
      }
    }

    return { application: app, revokedOnDutyPass: revokedPass };
  }

  /**
   * Verify an On-Duty Pass at event gate or academic verification desk
   */
  verifyOnDutyPass(passNumber: string): { isValid: boolean; pass?: OnDutyPass; message: string } {
    const pass = db.onDutyPasses.get(passNumber);
    if (!pass) {
      return { isValid: false, message: 'On-Duty pass not found' };
    }

    return {
      isValid: pass.isVerified,
      pass,
      message: pass.isVerified ? 'VALID_ON_DUTY_PASS: Excused for institutional event' : 'INVALID_OR_REVOKED_PASS',
    };
  }

  /**
   * Query leaves for a student
   */
  getStudentLeaves(studentId: string): LeaveApplication[] {
    return Array.from(db.leaveApplications.values()).filter(
      (l) => l.applicantId === studentId && l.applicantType === 'STUDENT'
    );
  }

  /**
   * Query leaves for a faculty member
   */
  getFacultyLeaves(facultyId: string): LeaveApplication[] {
    return Array.from(db.leaveApplications.values()).filter(
      (l) => l.applicantId === facultyId && l.applicantType === 'FACULTY'
    );
  }
}

export const leaveService = new LeaveService();
