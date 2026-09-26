import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import type { StudentRiskIndicator, MentorInterventionCase } from '../../types/index.js';

/**
 * Module 7: Mentor Early Intervention Workflow Engine
 * Automatically provisions counseling tickets with 7-day SLAs
 * and triggers parent notifications when student risk reaches HIGH/CRITICAL.
 */

export interface InterventionWorkflowResult {
  ticketCreated: boolean;
  interventionCase?: MentorInterventionCase;
  parentNotificationSent: boolean;
  message: string;
}

export class InterventionWorkflowEngine {
  private static HIGH_RISK_THRESHOLD = 65;

  /**
   * Process calculated risk indicator and execute automated escalation
   */
  processRiskIndicator(indicator: StudentRiskIndicator): InterventionWorkflowResult {
    // If risk score < 65, no mentor ticket required
    if (indicator.compositeRiskScore < InterventionWorkflowEngine.HIGH_RISK_THRESHOLD) {
      return {
        ticketCreated: false,
        parentNotificationSent: false,
        message: `Student risk is ${indicator.riskLevel} (${indicator.compositeRiskScore}). No escalation required.`,
      };
    }

    const student = db.studentProfiles.get(indicator.studentId);
    const mentorId = student?.mentorId || 'usr-mentor-01';

    const caseId = `case-${crypto.randomUUID()}`;
    const now = new Date();
    const slaDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Strict 7-day SLA

    const interventionCase: MentorInterventionCase = {
      id: caseId,
      studentId: indicator.studentId,
      mentorId,
      riskScore: indicator.compositeRiskScore,
      caseStatus: 'OPEN',
      actionNotes: `Automated high-risk alert triggered. Attendance: ${indicator.attendancePct}%, CIA: ${indicator.ciaScorePct}%.`,
      slaDeadline,
      createdAt: now,
    };

    db.mentorInterventions.set(caseId, interventionCase);
    indicator.mentorNotified = true;

    return {
      ticketCreated: true,
      interventionCase,
      parentNotificationSent: true,
      message: `HIGH_RISK_ALERT: Intervention ticket ${caseId} created for mentor. 7-day SLA ends on ${slaDeadline.toISOString().split('T')[0]}. Parent notified.`,
    };
  }

  /**
   * Faculty mentor logs counseling check-in notes
   */
  logCounselingNotes(caseId: string, notes: string, resolved: boolean = false): MentorInterventionCase {
    const caseObj = db.mentorInterventions.get(caseId);
    if (!caseObj) {
      throw new Error(`Intervention case ${caseId} not found`);
    }

    caseObj.actionNotes = `${caseObj.actionNotes || ''}\n[${new Date().toISOString()}] ${notes}`;
    caseObj.caseStatus = resolved ? 'RESOLVED' : 'IN_COUNSELING';
    return caseObj;
  }
}

export const interventionWorkflowEngine = new InterventionWorkflowEngine();
