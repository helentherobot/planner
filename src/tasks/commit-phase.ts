import type { Task, PlanState } from '@/types.js'
import type { Adapters } from '@/types.js'

export async function handleCommitPhase(
  task: Task,
  state: PlanState,
  _adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  return state
}
