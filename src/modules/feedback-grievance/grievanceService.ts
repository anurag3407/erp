import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import type {
  GrievanceCategory,
  GrievanceSeverity,
  GrievanceStatus,
  GrievanceTicket,
  GrievanceActionLog,
} from '../../types/index.js';

export interface FileGrievanceRequest {
  complainantId?: string;
  isAnonymous?: boolean;
  category: GrievanceCategory;
  severity?: GrievanceSeverity;
  title: string;
  description: string;
}

export class GrievanceService {
  /**
   * Standard Statutory SLA windows in hours
   * - Anti-Ragging: 24h (UGC zero-tolerance mandate)
   * - POSH: 168h (7 days - Internal Complaints Committee)
   * - Academic: 168h (7 days)
   * - Hostel/Infrastructure: 120h (5 days)
   * - Disciplinary: 240h (10 days)
   */
  private static SLA_HOURS: Record<GrievanceCategory, number> = {
    ANTI_RAGGING: 24,
    POSH: 168,
    ACADEMIC: 168,
    HOSTEL_INFRASTRUCTURE: 120,
    DISCIPLINARY: 240,
  };

  private static STATUTORY_COMMITTEES: Record<GrievanceCategory, string> = {
    ANTI_RAGGING: 'Statutory Anti-Ragging Squad & Monitoring Committee',
    POSH: 'Internal Complaints Committee (ICC - POSH Act 2013)',
    ACADEMIC: 'Institutional Academic Grievance Redressal Committee (AGRC)',
    HOSTEL_INFRASTRUCTURE: 'Hostel & Infrastructure Welfare Committee',
    DISCIPLINARY: 'Standing Proctorial Disciplinary Board',
  };

  /**
   * File a formal statutory grievance
   */
  fileGrievance(req: FileGrievanceRequest): GrievanceTicket {
    const ticketId = `grv-${crypto.randomUUID()}`;
    const now = new Date();
    const slaHours = GrievanceService.SLA_HOURS[req.category] || 168;
    const slaDeadline = new Date(now.getTime() + slaHours * 3600 * 1000);

    const ticketNumber = `GRV-${req.category.substring(0, 4)}-${now.getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const isAnonymous = !!req.isAnonymous;

    const ticket: GrievanceTicket = {
      id: ticketId,
      ticketNumber,
      complainantId: isAnonymous ? undefined : req.complainantId,
      isAnonymous,
      category: req.category,
      severity: req.severity || (req.category === 'ANTI_RAGGING' || req.category === 'POSH' ? 'CRITICAL' : 'NORMAL'),
      title: req.title,
      description: req.description,
      status: 'SUBMITTED',
      slaDeadline,
      isSlaBreached: false,
      assignedCommittee: GrievanceService.STATUTORY_COMMITTEES[req.category],
      createdAt: now,
      updatedAt: now,
    };

    db.grievanceTickets.set(ticketId, ticket);

    // Initial action log
    this.logAction(
      ticketId,
      'GRIEVANCE_SUBMITTED',
      req.complainantId || 'ANONYMOUS',
      `Grievance submitted under category ${req.category} with ${slaHours}h SLA`
    );

    return ticket;
  }

  /**
   * Record a statutory committee action/hearing in the audit log
   */
  logAction(ticketId: string, action: string, performedByUserId: string, notes?: string): GrievanceActionLog {
    const logId = `grv-act-${crypto.randomUUID()}`;
    const log: GrievanceActionLog = {
      id: logId,
      ticketId,
      action,
      performedByUserId,
      notes,
      timestamp: new Date(),
    };

    db.grievanceActionLogs.set(logId, log);
    return log;
  }

  /**
   * Update status to investigation or hearing
   */
  updateStatus(
    ticketId: string,
    status: GrievanceStatus,
    performedByUserId: string,
    notes?: string
  ): GrievanceTicket {
    const ticket = db.grievanceTickets.get(ticketId);
    if (!ticket) {
      throw new Error(`Grievance ticket not found: ${ticketId}`);
    }

    const now = new Date();
    ticket.status = status;
    ticket.updatedAt = now;
    if (status === 'RESOLVED' || status === 'CLOSED') {
      ticket.resolvedAt = ticket.resolvedAt || now;
      ticket.isSlaBreached = now.getTime() > ticket.slaDeadline.getTime();
      if (notes && !ticket.resolutionSummary) {
        ticket.resolutionSummary = notes;
      }
    }

    if (notes) {
      ticket.investigationNotes = ticket.investigationNotes
        ? `${ticket.investigationNotes}\n[${now.toISOString()}] ${notes}`
        : `[${now.toISOString()}] ${notes}`;
    }

    this.logAction(ticketId, `STATUS_CHANGED_TO_${status}`, performedByUserId, notes);
    return ticket;
  }

  /**
   * Formal resolution of statutory grievance
   */
  resolveGrievance(ticketId: string, resolvedByUserId: string, resolutionSummary: string): GrievanceTicket {
    const ticket = db.grievanceTickets.get(ticketId);
    if (!ticket) {
      throw new Error(`Grievance ticket not found: ${ticketId}`);
    }

    const now = new Date();
    ticket.status = 'RESOLVED';
    ticket.resolutionSummary = resolutionSummary;
    ticket.resolvedAt = now;
    ticket.updatedAt = now;
    ticket.isSlaBreached = now.getTime() > ticket.slaDeadline.getTime();

    this.logAction(ticketId, 'GRIEVANCE_RESOLVED', resolvedByUserId, resolutionSummary);
    return ticket;
  }

  /**
   * Escalate grievance to Executive Dean / Ombudsman
   */
  escalateGrievance(ticketId: string, escalatedByUserId: string, reason: string): GrievanceTicket {
    const ticket = db.grievanceTickets.get(ticketId);
    if (!ticket) {
      throw new Error(`Grievance ticket not found: ${ticketId}`);
    }

    ticket.status = 'ESCALATED';
    ticket.updatedAt = new Date();

    this.logAction(ticketId, 'ESCALATED_TO_OMBUDSMAN', escalatedByUserId, reason);
    return ticket;
  }

  /**
   * Check and update SLA breach status across all open tickets
   */
  checkSlaBreaches(referenceTime: Date = new Date()): { breachedCount: number; breachedTickets: GrievanceTicket[] } {
    const nowMs = referenceTime.getTime();
    const breachedTickets: GrievanceTicket[] = [];

    for (const ticket of db.grievanceTickets.values()) {
      if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
        if (nowMs > ticket.slaDeadline.getTime()) {
          ticket.isSlaBreached = true;
          breachedTickets.push(ticket);
        }
      }
    }

    return {
      breachedCount: breachedTickets.length,
      breachedTickets,
    };
  }

  /**
   * Retrieve action logs for a ticket
   */
  getActionLogs(ticketId: string): GrievanceActionLog[] {
    return Array.from(db.grievanceActionLogs.values())
      .filter((l) => l.ticketId === ticketId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Compute grievance statistics for NAAC Criterion 5 telemetry
   */
  getGrievanceStats(): {
    totalTickets: number;
    resolvedTickets: number;
    openTickets: number;
    breachedTickets: number;
    averageResolutionDays: number;
  } {
    const all = Array.from(db.grievanceTickets.values());
    const resolved = all.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED');
    const open = all.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED');
    const breached = all.filter((t) => t.isSlaBreached);

    let totalDurationMs = 0;
    for (const r of resolved) {
      const end = r.resolvedAt ? r.resolvedAt.getTime() : r.updatedAt.getTime();
      totalDurationMs += end - r.createdAt.getTime();
    }

    const averageResolutionDays =
      resolved.length > 0
        ? Math.round((totalDurationMs / (resolved.length * 86400000)) * 10) / 10
        : 0; // 0 if empty

    return {
      totalTickets: all.length,
      resolvedTickets: resolved.length,
      openTickets: open.length,
      breachedTickets: breached.length,
      averageResolutionDays,
    };
  }
}

export const grievanceService = new GrievanceService();
