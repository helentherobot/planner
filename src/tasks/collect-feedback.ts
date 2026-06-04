import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../types.js'
import { updatePhase } from '../helpers.js'

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

  const phasePipelineTasks = new Set([
    'check-phase',
    'investigate-phase',
    'revise-phase',
    'collect-feedback',
  ])
  const withoutStalePhaseTasks = (remaining: Task[]) =>
    remaining.filter(
      (t) => !(t.phase === phase && phasePipelineTasks.has(t.type)),
    )

  const nextIterations = phaseState.iterations + 1
  updatePhase(adapters.store, phase, { iterations: nextIterations })
  const updated = adapters.store.read()!

  if (!anyRaised && nextIterations >= adapters.config.minimumIterations) {
    return {
      ...updated,
      remainingTasks: withoutStalePhaseTasks(state.remainingTasks),
    }
  }

  if (nextIterations >= adapters.config.maximumIterations) {
    return {
      ...updated,
      remainingTasks: withoutStalePhaseTasks(state.remainingTasks),
    }
  }

  const checkAlreadyQueued = state.remainingTasks.some(
    (t) => t.type === 'check-phase' && t.phase === phase,
  )

  const collectAlreadyQueued = state.remainingTasks.some(
    (t) => t.type === 'collect-feedback' && t.phase === phase,
  )

  if (anyRaised) {
    const reviseAlreadyQueued = state.remainingTasks.some(
      (t) => t.type === 'revise-phase' && t.phase === phase,
    )
    const tasks: Task[] = [
      ...(!reviseAlreadyQueued
        ? [{ type: 'revise-phase', phase } as Task]
        : []),
      ...(!checkAlreadyQueued ? [{ type: 'check-phase', phase } as Task] : []),
      ...(!collectAlreadyQueued
        ? [{ type: 'collect-feedback', phase } as Task]
        : []),
    ]
    return { ...updated, remainingTasks: [...tasks, ...state.remainingTasks] }
  }

  const nextTasks: Task[] = [
    ...(!checkAlreadyQueued ? [{ type: 'check-phase', phase } as Task] : []),
    ...(!collectAlreadyQueued
      ? [{ type: 'collect-feedback', phase } as Task]
      : []),
  ]
  if (nextTasks.length === 0)
    return { ...updated, remainingTasks: state.remainingTasks }
  return { ...updated, remainingTasks: [...nextTasks, ...state.remainingTasks] }
}
