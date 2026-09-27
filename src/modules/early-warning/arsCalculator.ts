import type { RiskLevel, StudentRiskIndicator } from '../../types/index.js';
import { toIstDateKey } from '../../lib/time.js';

/**
 * Module 7: Academic Risk Scoring (ARS) Calculator
 * Computes weekly predictive risk scores from multi-factor inputs:
 * ARS = 0.40 * (100 - Attn%) + 0.35 * (100 - CIAScore%) + 0.15 * LMSInactivity + 0.10 * FeeDuesPenalty
 */

export interface StudentRiskInput {
  studentId: string;
  attendancePct: number;    // 0 - 100
  ciaScorePct: number;      // 0 - 100
  lmsInactivityDays: number;// 0 - 30+ days
  hasFeeDues: boolean;
}

export class ArsCalculator {
  /**
   * Determine risk tier from score
   */
  static determineRiskLevel(score: number): RiskLevel {
    if (score >= 85) return 'CRITICAL';
    if (score >= 65) return 'HIGH';
    if (score >= 50) return 'MODERATE';
    return 'LOW';
  }

  /**
   * Compute composite ARS score (0 - 100)
   */
  computeScore(input: StudentRiskInput): StudentRiskIndicator {
    // 1. Attendance penalty (0.40 weight)
    const attnTerm = 0.40 * Math.max(0, 100 - input.attendancePct);

    // 2. CIA score penalty (0.35 weight)
    const ciaTerm = 0.35 * Math.max(0, 100 - input.ciaScorePct);

    // 3. LMS Inactivity score (0.15 weight) - normalized so 14+ days inactivity = 100 penalty
    const lmsInactivityNormalized = Math.min(100, (input.lmsInactivityDays / 14) * 100);
    const lmsTerm = 0.15 * lmsInactivityNormalized;

    // 4. Fee Dues penalty (0.10 weight) - 100 if unpaid dues, 0 if clear
    const feePenaltyNormalized = input.hasFeeDues ? 100 : 0;
    const feeTerm = 0.10 * feePenaltyNormalized;

    // Composite ARS score
    const rawScore = attnTerm + ciaTerm + lmsTerm + feeTerm;
    const compositeRiskScore = Math.min(100, Math.max(0, Math.round(rawScore * 100) / 100));

    const riskLevel = ArsCalculator.determineRiskLevel(compositeRiskScore);

    return {
      studentId: input.studentId,
      calculationDate: toIstDateKey(),
      attendancePct: input.attendancePct,
      ciaScorePct: input.ciaScorePct,
      lmsActivityScore: Math.round((100 - lmsInactivityNormalized) * 100) / 100,
      feeDuesPenalty: feePenaltyNormalized,
      compositeRiskScore,
      riskLevel,
      mentorNotified: compositeRiskScore >= 65,
    };
  }
}

export const arsCalculator = new ArsCalculator();
