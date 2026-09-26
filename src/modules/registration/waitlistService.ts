import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import { seatEngine } from './seatEngine.js';

/**
 * Module 1: Course Waitlist Escalation Service
 * Manages waitlist ranking and automatically promotes top student
 * with a 2-hour reservation window upon seat cancellation.
 */

export interface WaitlistEntry {
  id: string;
  studentId: string;
  offeringId: string;
  position: number;
  reservedUntil?: Date;
  status: 'QUEUED' | 'OFFERED_RESERVATION' | 'EXPIRED' | 'ENROLLED';
}

export class WaitlistService {
  /**
   * Add student to waitlist
   */
  addToWaitlist(studentId: string, offeringId: string): WaitlistEntry {
    const existingEntries = Array.from(db.waitlists.values()).filter(
      (w) => w.offeringId === offeringId
    );
    const existing = existingEntries.find((w) => w.studentId === studentId);
    if (existing) {
      return {
        id: existing.id,
        studentId: existing.studentId,
        offeringId: existing.offeringId,
        position: existing.position,
        reservedUntil: existing.reservedUntil,
        status: existing.reservedUntil && new Date() < existing.reservedUntil ? 'OFFERED_RESERVATION' : 'QUEUED',
      };
    }

    const position = existingEntries.length + 1;
    const id = `wl-${crypto.randomUUID()}`;
    const entry = {
      id,
      studentId,
      offeringId,
      position,
    };
    db.waitlists.set(id, entry);

    const offering = db.courseOfferings.get(offeringId);
    if (offering) {
      offering.waitlistCount = position;
    }

    return {
      id,
      studentId,
      offeringId,
      position,
      status: 'QUEUED',
    };
  }

  /**
   * Escalate top waitlisted student when a seat frees up
   * Grants 2-hour reservation window
   */
  async escalateNextStudent(offeringId: string): Promise<WaitlistEntry | null> {
    const entries = Array.from(db.waitlists.values())
      .filter((w) => w.offeringId === offeringId && (!w.reservedUntil || new Date() > w.reservedUntil))
      .sort((a, b) => a.position - b.position);

    if (entries.length === 0) {
      return null;
    }

    const nextStudent = entries[0];
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    nextStudent.reservedUntil = twoHoursFromNow;

    // Place a 2-hour (7200s) hold in seatEngine for the student
    await seatEngine.reserveSeat(offeringId, nextStudent.studentId, 7200);

    return {
      id: nextStudent.id,
      studentId: nextStudent.studentId,
      offeringId: nextStudent.offeringId,
      position: nextStudent.position,
      reservedUntil: twoHoursFromNow,
      status: 'OFFERED_RESERVATION',
    };
  }
}

export const waitlistService = new WaitlistService();
