import { z } from 'zod';

/**
 * Enterprise College ERP - Zod Validation Schemas
 * Comprehensive security validation for server actions and API requests
 */

export const attendancePunchSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required').max(100),
  offeringId: z.string().min(1, 'Course offering ID is required').max(100),
  token: z.string().min(8, 'Valid token is required').max(128),
  roomSecret: z.string().min(1).max(100).default('default-room-secret'),
  studentCoords: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  classroomCoords: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  maxRadiusMeters: z.number().positive().max(1000).default(25),
  timestampMs: z.number().positive(),
});

export const courseEnrollmentSchema = z.object({
  studentId: z.string().min(1).max(100),
  offeringId: z.string().min(1).max(100),
});

export const leaveApplicationSchema = z.object({
  applicantId: z.string().min(1).max(100),
  applicantRole: z.enum(['STUDENT', 'FACULTY']),
  leaveType: z.enum(['CASUAL', 'MEDICAL', 'DUTY_LEAVE_OD', 'ACADEMIC_CONFERENCE', 'MATERNITY_PATERNITY', 'SABBATICAL']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(500),
  substituteFacultyId: z.string().max(100).optional(),
});

export const grievanceSubmissionSchema = z.object({
  complainantId: z.string().max(100).optional(),
  isAnonymous: z.boolean().default(false),
  category: z.enum(['ANTI_RAGGING', 'ACADEMIC', 'HARASSMENT_POSH', 'INFRASTRUCTURE']),
  subject: z.string().min(5).max(150),
  description: z.string().min(10).max(2000),
});

export const feePaymentSchema = z.object({
  studentId: z.string().min(1).max(100),
  transactionId: z.string().min(1).max(100),
  paymentMethod: z.enum(['UPI', 'NET_BANKING', 'CARD', 'CASH']).default('UPI'),
});

export const provisionalPassSchema = z.object({
  studentId: z.string().min(1).max(100),
  reason: z.string().min(5).max(300),
});

export const libraryActionSchema = z.object({
  bookId: z.string().min(1).max(100),
  borrowerId: z.string().min(1).max(100),
});

export const whatIfSimulationSchema = z.object({
  studentId: z.string().min(1).max(100),
  targetProgramId: z.string().min(1).max(100),
});
