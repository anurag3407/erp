import type { NepExitMilestone } from '../../types/index.js';

/**
 * Module 3: NEP 2020 Multi-Entry / Multi-Exit Milestone Engine
 * Evaluates credit milestones according to the National Higher Education
 * Qualifications Framework (NHEQF).
 */

export interface NepMilestoneEvaluation {
  level: 1 | 2 | 3 | 4;
  milestoneName: NepExitMilestone;
  title: string;
  requiredCredits: number;
  earnedCredits: number;
  isEligible: boolean;
  creditDelta: number;
  canExitWithAward: boolean;
}

export class NepMilestoneService {
  private static MILESTONES: Array<{
    level: 1 | 2 | 3 | 4;
    milestoneName: NepExitMilestone;
    title: string;
    requiredCredits: number;
  }> = [
    { level: 1, milestoneName: 'CERTIFICATE', title: 'Undergraduate Certificate', requiredCredits: 40 },
    { level: 2, milestoneName: 'DIPLOMA', title: 'Undergraduate Diploma', requiredCredits: 80 },
    { level: 3, milestoneName: 'DEGREE', title: "Bachelor's Degree", requiredCredits: 120 },
    { level: 4, milestoneName: 'HONORS_RESEARCH', title: "Bachelor's Degree (Honors / Research)", requiredCredits: 160 },
  ];

  /**
   * Evaluate all 4 NEP 2020 exit tiers for a student
   */
  evaluateStudentMilestones(earnedCredits: number): {
    currentEligibleTier: NepMilestoneEvaluation;
    nextTier?: NepMilestoneEvaluation;
    allTiers: NepMilestoneEvaluation[];
  } {
    const allTiers: NepMilestoneEvaluation[] = NepMilestoneService.MILESTONES.map((m) => {
      const isEligible = earnedCredits >= m.requiredCredits;
      const creditDelta = Math.max(0, m.requiredCredits - earnedCredits);
      return {
        level: m.level,
        milestoneName: m.milestoneName,
        title: m.title,
        requiredCredits: m.requiredCredits,
        earnedCredits,
        isEligible,
        creditDelta,
        canExitWithAward: isEligible,
      };
    });

    const eligibleTiers = allTiers.filter((t) => t.isEligible);
    const currentEligibleTier = eligibleTiers.length > 0
      ? eligibleTiers[eligibleTiers.length - 1]
      : {
          level: 1 as const,
          milestoneName: 'CERTIFICATE' as const,
          title: 'Undergraduate Certificate',
          requiredCredits: 40,
          earnedCredits,
          isEligible: false,
          creditDelta: 40 - earnedCredits,
          canExitWithAward: false,
        };

    const nextTier = allTiers.find((t) => !t.isEligible);

    return {
      currentEligibleTier,
      nextTier,
      allTiers,
    };
  }
}

export const nepMilestoneService = new NepMilestoneService();
