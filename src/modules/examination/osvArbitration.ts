import type { OnScreenEvaluationScript } from '../../types/index.js';

/**
 * Module 4: Double-Blind On-Screen Evaluation (OSV) Arbitration Engine
 * Detects score variance between dual evaluators. If variance > 15%,
 * automatically flags and routes script to Chief Examiner.
 */

export interface EvaluationSubmissionResult {
  scriptId: string;
  status: 'PENDING_EVAL_1' | 'PENDING_EVAL_2' | 'ARBITRATION_REQUIRED' | 'FINALIZED';
  variancePct?: number;
  finalScore?: number;
  message: string;
}

export class OsvArbitrationService {
  private static VARIANCE_THRESHOLD = 0.15; // 15%

  /**
   * Submit evaluation score from Evaluator 1 or 2
   */
  processEvaluatorScore(
    script: OnScreenEvaluationScript,
    evaluatorNumber: 1 | 2,
    score: number
  ): EvaluationSubmissionResult {
    if (score < 0 || score > script.maxScore) {
      throw new Error(`Score must be between 0 and ${script.maxScore}`);
    }

    if (evaluatorNumber === 1) {
      script.evaluator1Score = score;
      if (script.evaluator2Score === undefined) {
        script.status = 'PENDING_EVAL_2';
        return {
          scriptId: script.id,
          status: 'PENDING_EVAL_2',
          message: 'Score 1 recorded. Awaiting independent evaluation from Evaluator 2.',
        };
      }
    } else {
      script.evaluator2Score = score;
      if (script.evaluator1Score === undefined) {
        script.status = 'PENDING_EVAL_1';
        return {
          scriptId: script.id,
          status: 'PENDING_EVAL_1',
          message: 'Score 2 recorded. Awaiting independent evaluation from Evaluator 1.',
        };
      }
    }

    // Both scores present: calculate variance percentage
    const s1 = script.evaluator1Score!;
    const s2 = script.evaluator2Score!;
    const absoluteDiff = Math.abs(s1 - s2);
    const variancePct = Math.round((absoluteDiff / script.maxScore) * 10000) / 100; // e.g. 18.5%

    if (variancePct > OsvArbitrationService.VARIANCE_THRESHOLD * 100) {
      script.status = 'ARBITRATION_REQUIRED';
      script.arbitrationReason = `High evaluator variance of ${variancePct}% (Diff: ${absoluteDiff} marks on max ${script.maxScore}) exceeds the 15% arbitration limit.`;
      return {
        scriptId: script.id,
        status: 'ARBITRATION_REQUIRED',
        variancePct,
        message: script.arbitrationReason,
      };
    }

    // Variance within 15%: auto-compile ledger with average
    const finalScore = Math.round(((s1 + s2) / 2) * 100) / 100;
    script.finalScore = finalScore;
    script.status = 'FINALIZED';

    return {
      scriptId: script.id,
      status: 'FINALIZED',
      variancePct,
      finalScore,
      message: `Evaluation finalized successfully. Average score: ${finalScore}/${script.maxScore} (Variance: ${variancePct}%).`,
    };
  }

  /**
   * Submit Chief Examiner arbitration score
   */
  resolveArbitration(
    script: OnScreenEvaluationScript,
    arbiterId: string,
    arbiterScore: number
  ): EvaluationSubmissionResult {
    if (script.status !== 'ARBITRATION_REQUIRED') {
      throw new Error('Script is not flagged for arbitration');
    }
    if (arbiterScore < 0 || arbiterScore > script.maxScore) {
      throw new Error(`Arbiter score must be between 0 and ${script.maxScore}`);
    }

    script.arbiterId = arbiterId;
    script.arbiterScore = arbiterScore;
    script.finalScore = arbiterScore;
    script.status = 'FINALIZED';

    return {
      scriptId: script.id,
      status: 'FINALIZED',
      finalScore: arbiterScore,
      message: `Arbitration resolved by Chief Examiner. Final score established at ${arbiterScore}/${script.maxScore}.`,
    };
  }
}

export const osvArbitrationService = new OsvArbitrationService();
