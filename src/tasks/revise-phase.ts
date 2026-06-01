import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../adapters.js'
import { revisePhase as revisePhaseRecipe } from '../recipes/revise-phase.js'
import { updatePhase, updateControl } from '../store-helpers.js'

export async function handleRevisePhase(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]

  const allIssues: string[] = []
  for (const control of adapters.controls) {
    const controlState = phaseState.controls[control.name]
    if (controlState?.raised?.length) {
      allIssues.push(...controlState.raised)
    }
  }

  if (allIssues.length === 0) {
    return state
  }

  const result = await adapters.tools.runner.run(revisePhaseRecipe, [
    { phase, phaseState, issues: allIssues },
  ])

  updatePhase(adapters.store, phase, { brief: result.text })

  for (const control of adapters.controls) {
    const controlState = phaseState.controls[control.name]
    if (controlState?.raised?.length) {
      updateControl(adapters.store, phase, control.name, { raised: [] })
    }
  }

  return adapters.store.read()!
}
