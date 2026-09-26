import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import type {
  AcademicTerm,
  CalendarEvent,
  CalendarEventType,
  SemesterType,
  TermStatus,
} from '../../types/index.js';

export interface CreateTermRequest {
  name: string;
  academicYear: string;
  semesterType: SemesterType;
  startDate: Date;
  endDate: Date;
  registrationStartDate: Date;
  registrationEndDate: Date;
  addDropDeadline: Date;
  gradeLockDeadline: Date;
  status?: TermStatus;
}

export interface AddCalendarEventRequest {
  termId: string;
  title: string;
  eventType: CalendarEventType;
  startDate: Date;
  endDate: Date;
  isInstructionalDay?: boolean;
}

export class AcademicCalendarService {
  /**
   * Create an explicit academic term with registration and grade lock windows
   */
  async createTerm(req: CreateTermRequest): Promise<AcademicTerm> {
    if (req.startDate >= req.endDate) {
      throw new Error('INVALID_DATES: Term start date must precede end date');
    }
    if (req.registrationStartDate >= req.registrationEndDate) {
      throw new Error('INVALID_DATES: Registration start date must precede registration end date');
    }
    if (req.addDropDeadline < req.registrationStartDate) {
      throw new Error('INVALID_DATES: Add/drop deadline cannot be earlier than registration start date');
    }
    if (req.gradeLockDeadline > req.endDate) {
      // Typically within or immediately after term
    }

    const termId = `term-${crypto.randomUUID()}`;
    const term: AcademicTerm = {
      id: termId,
      name: req.name,
      academicYear: req.academicYear,
      semesterType: req.semesterType,
      startDate: req.startDate,
      endDate: req.endDate,
      registrationStartDate: req.registrationStartDate,
      registrationEndDate: req.registrationEndDate,
      addDropDeadline: req.addDropDeadline,
      gradeLockDeadline: req.gradeLockDeadline,
      status: req.status || 'ACTIVE',
    };

    await db.academicTerms.set(termId, term);
    return term;
  }

  /**
   * Retrieve active academic term
   */
  async getActiveTerm(): Promise<AcademicTerm | undefined> {
    return (await db.academicTerms.values()).find((t) => t.status === 'ACTIVE');
  }

  /**
   * Retrieve term by ID
   */
  async getTerm(termId: string): Promise<AcademicTerm | undefined> {
    return db.academicTerms.get(termId);
  }

  /**
   * Update term lifecycle status
   */
  async updateTermStatus(termId: string, status: TermStatus): Promise<AcademicTerm> {
    const term = await db.academicTerms.get(termId);
    if (!term) {
      throw new Error(`Academic term not found: ${termId}`);
    }
    term.status = status;
    await db.academicTerms.set(term.id, term);
    return term;
  }

  /**
   * Add calendar event to term
   */
  async addCalendarEvent(req: AddCalendarEventRequest): Promise<CalendarEvent> {
    if (req.startDate > req.endDate) {
      throw new Error('INVALID_DATES: Event start date must precede or equal end date');
    }

    const term = await db.academicTerms.get(req.termId);
    if (!term) {
      throw new Error(`Academic term not found: ${req.termId}`);
    }

    const eventId = `cal-${crypto.randomUUID()}`;
    const event: CalendarEvent = {
      id: eventId,
      termId: req.termId,
      title: req.title,
      eventType: req.eventType,
      startDate: req.startDate,
      endDate: req.endDate,
      isInstructionalDay: req.isInstructionalDay ?? false,
    };

    await db.calendarEvents.set(eventId, event);
    return event;
  }

  /**
   * Get all calendar events for a term
   */
  async getEventsForTerm(termId: string): Promise<CalendarEvent[]> {
    return (await db.calendarEvents.values()).filter((e) => e.termId === termId);
  }

  /**
   * Calculate instructional days in a term (UGC/AICTE requires >= 90 instructional days)
   */
  async getInstructionalDays(termId: string): Promise<{ totalDays: number; instructionalDays: number; holidaysCount: number }> {
    const term = await db.academicTerms.get(termId);
    if (!term) {
      throw new Error(`Academic term not found: ${termId}`);
    }

    const events = await this.getEventsForTerm(termId);
    const holidays = events.filter((e) => e.eventType === 'HOLIDAY');

    const totalDays = Math.ceil((term.endDate.getTime() - term.startDate.getTime()) / 86400000);
    let instructionalCount = 0;
    const cur = new Date(term.startDate);
    const end = new Date(term.endDate);

    const holidayDates = new Set(
      holidays.map((h) => h.startDate.toISOString().split('T')[0])
    );

    while (cur <= end) {
      const day = cur.getUTCDay();
      const dateStr = cur.toISOString().split('T')[0];
      if (day !== 0 && !holidayDates.has(dateStr)) {
        instructionalCount++;
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    return {
      totalDays,
      instructionalDays: instructionalCount,
      holidaysCount: holidays.length,
    };
  }

  /**
   * Gatekeeper: Validate whether course registration is open on a given date
   */
  async isRegistrationOpen(termId: string, date: Date = new Date()): Promise<{ allowed: boolean; reason?: string }> {
    const term = await db.academicTerms.get(termId);
    if (!term) {
      return { allowed: false, reason: `Academic term not found: ${termId}` };
    }

    const t = date.getTime();
    const regStart = term.registrationStartDate.getTime();
    const regEnd = term.registrationEndDate.getTime();

    if (t < regStart) {
      return {
        allowed: false,
        reason: `REGISTRATION_NOT_OPEN: Registration begins on ${term.registrationStartDate.toISOString()}`,
      };
    }

    if (t > regEnd) {
      return {
        allowed: false,
        reason: `REGISTRATION_CLOSED: Registration ended on ${term.registrationEndDate.toISOString()}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Gatekeeper: Validate whether student can add or drop a course on a given date
   */
  async canAddDropCourse(termId: string, date: Date = new Date()): Promise<{ allowed: boolean; reason?: string }> {
    const term = await db.academicTerms.get(termId);
    if (!term) {
      return { allowed: false, reason: `Academic term not found: ${termId}` };
    }

    const t = date.getTime();
    const addDropEnd = term.addDropDeadline.getTime();

    if (t > addDropEnd) {
      return {
        allowed: false,
        reason: `ADD_DROP_DEADLINE_EXPIRED: Add/drop deadline expired on ${term.addDropDeadline.toISOString()}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Gatekeeper: Validate whether faculty can submit or modify grades on a given date
   */
  async isGradeSubmissionOpen(termId: string, date: Date = new Date()): Promise<{ allowed: boolean; reason?: string }> {
    const term = await db.academicTerms.get(termId);
    if (!term) {
      return { allowed: false, reason: `Academic term not found: ${termId}` };
    }

    if (term.status === 'GRADES_LOCKED' || term.status === 'ARCHIVED') {
      return {
        allowed: false,
        reason: `GRADES_LOCKED: Term grades are permanently locked. Registrar exception required.`,
      };
    }

    const t = date.getTime();
    const gradeLockEnd = term.gradeLockDeadline.getTime();

    if (t > gradeLockEnd) {
      return {
        allowed: false,
        reason: `GRADE_LOCK_DEADLINE_PASSED: Grade submission deadline was ${term.gradeLockDeadline.toISOString()}`,
      };
    }

    return { allowed: true };
  }
}

export const academicCalendarService = new AcademicCalendarService();
