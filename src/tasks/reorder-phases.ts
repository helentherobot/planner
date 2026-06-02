import type { Task, PlanState } from '@/types.js'
import type { Adapters } from '@/types.js'

export async function handleReorderPhases(
  _task: Task,
  state: PlanState,
  _adapters: Adapters,
): Promise<PlanState> {
  return state
}
