import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import type { AgsScorePayload } from './ltiAdvantage.js';
import { facultyGradebookService } from '../gradebook/facultyGradebookService.js';

/**
 * Module 9: LMS Grade Passback Worker
 * Streams assignment and quiz scores from LMS (Canvas/Moodle) into
 * the ERP assessment CIA marks ledger with zero manual re-entry.
 * Preserves faculty manual overrides (is_manual_override).
 */

export interface GradeSyncResult {
  syncedCount: number;
  failedCount: number;
  skippedOverrideCount: number;
  records: Array<{
    studentId: string;
    offeringId: string;
    normalizedCiaScore: number;
    preservedManualOverride?: boolean;
  }>;
}


export class GradeSyncWorker {
  /**
   * Ingest grade batch from LMS Assignment and Grade Services (AGS)
   * Preserves manual grades when is_manual_override is true
   */
  async syncLmsScores(scores: AgsScorePayload[]): Promise<GradeSyncResult> {
    const records: Array<{
      studentId: string;
      offeringId: string;
      normalizedCiaScore: number;
      preservedManualOverride?: boolean;
    }> = [];
    let synced = 0;
    let failed = 0;
    let skippedOverrideCount = 0;

    for (const score of scores) {
      if (score.scoreMaximum <= 0) {
        failed++;
        continue;
      }

      // Check if faculty has a manual grade override for this student and offering
      const isManualOverridden = await facultyGradebookService.isGradeOverridden(
        score.offeringId,
        score.studentId,
        score.activityId
      );

      if (isManualOverridden) {
        // Preserve faculty manual grade!
        skippedOverrideCount++;
        records.push({
          studentId: score.studentId,
          offeringId: score.offeringId,
          normalizedCiaScore: 0, // preserved in gradebook
          preservedManualOverride: true,
        });
        continue;
      }

      // Normalize score to percentage (0 - 100)
      const normalizedScore = Math.round((score.scoreGiven / score.scoreMaximum) * 10000) / 100;

      records.push({
        studentId: score.studentId,
        offeringId: score.offeringId,
        normalizedCiaScore: normalizedScore,
        preservedManualOverride: false,
      });
      synced++;
    }

    return {
      syncedCount: synced,
      failedCount: failed,
      skippedOverrideCount,
      records,
    };
  }
}

export const gradeSyncWorker = new GradeSyncWorker();
