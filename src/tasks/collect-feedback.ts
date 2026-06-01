import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../adapters.js'
import { updatePhase } from '../store-helpers.js'

export async function handleCollectFeedback(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]

  const anyRaised = adapters.controls.some(
    (c) => (phaseState.controls[c.name]?.raised?.length ?? 0) > 0,
  )

  if (anyRaised) {
    const tasks: Task[] = [
      { type: 'revise-phase', phase },
      { type: 'check-phase', phase },
    ]
    return {
      ...state,
      remainingTasks: [...tasks, ...state.remainingTasks],
    }
  }

  if (phaseState.iterations < state.config.minimumIterations) {
    updatePhase(adapters.store, phase, { iterations: phaseState.iterations + 1 })
    const checkTask: Task = { type: 'check-phase', phase }
    return {
      ...adapters.store.read()!,
      remainingTasks: [checkTask, ...state.remainingTasks],
    }
  }

  const commitTask: Task = { type: 'commit-phase', phase }
  return {
    ...state,
    remainingTasks: [commitTask, ...state.remainingTasks],
  }
}
