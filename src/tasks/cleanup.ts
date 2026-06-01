import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../adapters.js'

export async function handleCleanup(
  _task: Task,
  state: PlanState,
  _adapters: Adapters,
): Promise<PlanState> {
  return { ...state, completedAt: Date.now() }
}
