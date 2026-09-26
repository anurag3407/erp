/**
 * Module 10: Sub-150ms Optimistic UI Transition Handler
 * Applies immediate optimistic local state updates with rollback on network rejection.
 */

export interface OptimisticMutationResult<T> {
  optimisticState: T;
  confirmedState?: T;
  latencyMs: number;
  success: boolean;
  rolledBack: boolean;
}

export class OptimisticUiManager {
  /**
   * Execute optimistic state mutation with latency measurement
   */
  async executeOptimisticMutation<TState, TResult>(
    currentState: TState,
    optimisticApply: (prev: TState) => TState,
    networkAction: () => Promise<TResult>,
    rollbackApply?: (prev: TState) => TState
  ): Promise<OptimisticMutationResult<TState>> {
    const startTime = performance.now();
    const optimisticState = optimisticApply(currentState);
    const initialTransitionMs = performance.now() - startTime;

    // Must update UI locally in under 150ms (typically <5ms in memory)
    if (initialTransitionMs > 150) {
      console.warn(`[PWA WARNING] Optimistic transition exceeded 150ms budget: ${initialTransitionMs}ms`);
    }

    try {
      await networkAction();
      const endTime = performance.now();
      return {
        optimisticState,
        confirmedState: optimisticState,
        latencyMs: Math.round((endTime - startTime) * 100) / 100,
        success: true,
        rolledBack: false,
      };
    } catch {
      const rolledBackState = rollbackApply ? rollbackApply(optimisticState) : currentState;
      const endTime = performance.now();
      return {
        optimisticState: rolledBackState,
        latencyMs: Math.round((endTime - startTime) * 100) / 100,
        success: false,
        rolledBack: true,
      };
    }
  }
}

export const optimisticUiManager = new OptimisticUiManager();
