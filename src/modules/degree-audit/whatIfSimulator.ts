import type { Course } from '../../types/index.js';

/**
 * Module 3: Real-Time "What-If" Major/Minor Simulation Engine
 * Computes course intersections, prerequisite gaps, and projected semesters
 * for degree program switching in under 100ms.
 */

export interface WhatIfSimulationResult {
  currentProgramId: string;
  targetProgramId: string;
  totalCompletedCredits: number;
  transferableCredits: number;
  transferPercentage: number;
  waivedCredits: number;
  remainingCreditsRequired: number;
  targetTotalRequired: number;
  projectedAdditionalSemesters: number;
  transferredCourses: Array<{ code: string; name: string; credits: number }>;
  remainingBuckets: Record<string, number>;
  simulationTimeMs: number;
}

export class WhatIfSimulator {
  /**
   * Run simulation comparing completed courses against target program curriculum
   */
  simulateProgramSwitch(
    currentProgramId: string,
    targetProgramId: string,
    completedCourses: Course[],
    targetProgramCourses: Course[],
    targetTotalRequiredCredits: number = 160
  ): WhatIfSimulationResult {
    const startTime = performance.now();

    const targetCourseMap = new Map<string, Course>();
    for (const c of targetProgramCourses) {
      targetCourseMap.set(c.code, c);
    }

    const transferredCourses: Array<{ code: string; name: string; credits: number }> = [];
    let transferableCredits = 0;
    let totalCompletedCredits = 0;

    for (const c of completedCourses) {
      totalCompletedCredits += c.credits;
      // If course is in target curriculum or can be counted as Open Elective
      if (targetCourseMap.has(c.code)) {
        transferredCourses.push({ code: c.code, name: c.name, credits: c.credits });
        transferableCredits += c.credits;
      } else if (c.bucketType === 'OPEN_ELECTIVE' || c.bucketType === 'ABILITY_ENHANCEMENT') {
        // Interdisciplinary electives carry over
        transferredCourses.push({ code: c.code, name: c.name, credits: c.credits });
        transferableCredits += c.credits;
      }
    }

    const waivedCredits = totalCompletedCredits - transferableCredits;
    const remainingCreditsRequired = Math.max(0, targetTotalRequiredCredits - transferableCredits);
    const standardCreditsPerSemester = 20;
    const projectedAdditionalSemesters = Math.ceil(remainingCreditsRequired / standardCreditsPerSemester);
    const transferPercentage = totalCompletedCredits > 0
      ? Math.round((transferableCredits / totalCompletedCredits) * 100)
      : 0;

    // Calculate required and remaining credits dynamically per bucket
    const targetBucketTotals: Record<string, number> = {
      CORE: 0,
      DISCIPLINE_ELECTIVE: 0,
      OPEN_ELECTIVE: 0,
      ABILITY_ENHANCEMENT: 0,
    };
    for (const tc of targetProgramCourses) {
      if (tc.bucketType in targetBucketTotals) {
        targetBucketTotals[tc.bucketType] += tc.credits;
      }
    }

    const transferredBucketTotals: Record<string, number> = {
      CORE: 0,
      DISCIPLINE_ELECTIVE: 0,
      OPEN_ELECTIVE: 0,
      ABILITY_ENHANCEMENT: 0,
    };
    for (const c of completedCourses) {
      if (targetCourseMap.has(c.code) || c.bucketType === 'OPEN_ELECTIVE' || c.bucketType === 'ABILITY_ENHANCEMENT') {
        if (c.bucketType in transferredBucketTotals) {
          transferredBucketTotals[c.bucketType] += c.credits;
        }
      }
    }

    const remainingBuckets: Record<string, number> = {
      CORE: Math.max(0, (targetBucketTotals.CORE || 60) - transferredBucketTotals.CORE),
      DISCIPLINE_ELECTIVE: Math.max(0, (targetBucketTotals.DISCIPLINE_ELECTIVE || 30) - transferredBucketTotals.DISCIPLINE_ELECTIVE),
      OPEN_ELECTIVE: Math.max(0, (targetBucketTotals.OPEN_ELECTIVE || 0) - transferredBucketTotals.OPEN_ELECTIVE),
      ABILITY_ENHANCEMENT: Math.max(0, (targetBucketTotals.ABILITY_ENHANCEMENT || 0) - transferredBucketTotals.ABILITY_ENHANCEMENT),
    };

    const endTime = performance.now();
    const simulationTimeMs = Math.round((endTime - startTime) * 100) / 100;

    return {
      currentProgramId,
      targetProgramId,
      totalCompletedCredits,
      transferableCredits,
      transferPercentage,
      waivedCredits,
      remainingCreditsRequired,
      targetTotalRequired: targetTotalRequiredCredits,
      projectedAdditionalSemesters,
      transferredCourses,
      remainingBuckets,
      simulationTimeMs,
    };
  }
}

export const whatIfSimulator = new WhatIfSimulator();
