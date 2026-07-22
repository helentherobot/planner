import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../types.js'

export async function handleCleanup(
  _task: Task,
  state: PlanState,
  _adapters: Adapters,
): Promise<PlanState> {
  if (!(state.crossPhaseCheckComplete ?? false)) {
    return {
      ...state,
      crossPhaseCheckComplete: true,
      remainingTasks: [
        { type: 'cross-phase-check' },
        { type: 'cleanup' },
        ...state.remainingTasks,
      ],
    }
  }

  return { ...state, completedAt: Date.now() }
}
