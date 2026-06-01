import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../adapters.js'
import { normalizePhasePlan as normalizePhasePlanRecipe } from '../recipes/normalize-phase-plan.js'
import { updatePhase } from '../store-helpers.js'

export async function handleNormalizePhasePlan(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]
  const result = await adapters.tools.runner.run(normalizePhasePlanRecipe, [{ phase, phaseState }])
  updatePhase(adapters.store, phase, { brief: result.text })
  return { ...state, phases: adapters.store.read()!.phases }
}
