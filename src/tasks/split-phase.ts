import type { Task, PlanState, PhaseState } from '../types.js'
import type { Adapters } from '../adapters.js'
import { splitPhase as splitPhaseRecipe } from '../recipes/split-phase.js'
import { phaseTaskOrder } from '../phase-map.js'

export async function handleSplitPhase(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]
  const maxFiles = state.config.maxFilesPerPhase

  const fileCount = (phaseState.index ?? '').split('\n').filter((l) => l.trim()).length
  if (fileCount <= maxFiles) {
    return state
  }

  const result = await adapters.tools.runner.run(splitPhaseRecipe, [
    { phase, phaseState, maxFiles },
  ])

  let subPhases: Array<{ title: string; brief: string }>
  try {
    subPhases = JSON.parse(result.text)
  } catch {
    console.warn('split-phase: failed to parse split result, skipping split')
    return state
  }

  if (!Array.isArray(subPhases) || subPhases.length < 2) {
    return state
  }

  const newPhaseStates: PhaseState[] = subPhases.map((sp) => ({
    title: sp.title,
    brief: sp.brief,
    controls: {},
    iterations: 0,
  }))

  const newTasks: Task[] = []
  for (let i = 0; i < newPhaseStates.length; i++) {
    const newIndex = phase + i
    for (const type of phaseTaskOrder) {
      newTasks.push({ type, phase: newIndex })
    }
  }

  const updatedPhases = [
    ...state.phases.slice(0, phase),
    ...newPhaseStates,
    ...state.phases.slice(phase + 1),
  ]

  const updatedRemaining = [...newTasks, ...state.remainingTasks]

  const nextState: PlanState = {
    ...state,
    phases: updatedPhases,
    remainingTasks: updatedRemaining,
  }

  adapters.store.write(nextState)
  return nextState
}
