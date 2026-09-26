import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import { signVerifiableDocument } from '../../lib/crypto.js';
import type { ProvisionalHallTicket } from '../../types/index.js';

/**
 * Module 5: 48-Hour Provisional Exam Pass Engine
 * Issues emergency 48-hour exam passes when payment reconciliation is delayed,
 * guaranteeing students are never blocked at exam hall gates due to bank network drops.
 */

export interface ProvisionalPassRequest {
  studentId: string;
  examId: string;
  utrReferenceNumber: string;
  grantedByUserId: string;
  reason?: string;
}

export class ProvisionalHallTicketService {
  /**
   * Issue a 48-Hour Provisional Hall Ticket
   */
  async issueProvisionalPass(req: ProvisionalPassRequest): Promise<ProvisionalHallTicket> {
    const student = await db.studentProfiles.get(req.studentId);
    if (!student) {
      throw new Error(`Student not found: ${req.studentId}`);
    }

    const passId = `pht-${crypto.randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48-hour validity

    const payloadToSign = {
      provisionalPassId: passId,
      studentId: req.studentId,
      rollNumber: student.rollNumber,
      examId: req.examId,
      utrReferenceNumber: req.utrReferenceNumber,
      validFrom: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isProvisional: true,
      reason: req.reason || 'PAYMENT_PENDING_GATEWAY_RECONCILIATION',
    };

    const { signature } = signVerifiableDocument(payloadToSign);

    const ticket: ProvisionalHallTicket = {
      id: passId,
      studentId: req.studentId,
      examId: req.examId,
      utrReferenceNumber: req.utrReferenceNumber,
      grantedBy: req.grantedByUserId,
      grantedAt: now,
      expiresAt,
      isReconciled: false,
      qrPayload: JSON.stringify({
        ...payloadToSign,
        sig: signature,
      }),
    };

    await db.provisionalHallTickets.set(passId, ticket);

    return ticket;
  }

  /**
   * Validate a provisional hall ticket at the exam gate
   */
  async validatePassAtGate(passId: string): Promise<{ isValid: boolean; remainingHours: number; message: string }> {
    const ticket = await db.provisionalHallTickets.get(passId);
    if (!ticket) {
      return { isValid: false, remainingHours: 0, message: 'Provisional pass not found' };
    }

    const now = Date.now();
    const expiresMs = ticket.expiresAt.getTime();

    if (now > expiresMs) {
      return {
        isValid: false,
        remainingHours: 0,
        message: 'EXPIRED_PROVISIONAL_PASS: 48-hour grace window has elapsed. Please consult Bursar.',
      };
    }

    const remainingHours = Math.round(((expiresMs - now) / (3600 * 1000)) * 10) / 10;
    return {
      isValid: true,
      remainingHours,
      message: `VALID_PROVISIONAL_PASS: Admitted to exam hall. Remaining grace: ${remainingHours} hours.`,
    };
  }
}

export const provisionalHallTicketService = new ProvisionalHallTicketService();
