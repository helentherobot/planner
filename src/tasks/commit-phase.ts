import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../adapters.js'

export async function handleCommitPhase(
  task: Task,
  state: PlanState,
  _adapters: Adapters,
): Promise<PlanState> {
  const completed = state.completedTasks.concat({ ...task, committedAt: Date.now() })
  return { ...state, completedTasks: completed }
}
