import type { Task, PlanState } from '@/types.js'
import type { Adapters } from '@/types.js'
import { normalizePhasePlan as normalizePhasePlanRecipe } from '@/recipes/normalize-phase-plan.js'
import { resolveProfile, runRecipe, updatePhase } from '@/helpers.js'

export async function handleNormalizePhasePlan(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]
  const result = await runRecipe(
    adapters.tools.runner,
    await resolveProfile(adapters, task.type, normalizePhasePlanRecipe.profile),
    normalizePhasePlanRecipe,
    [{ phase, phaseState }],
  )
  updatePhase(adapters.store, phase, { brief: result.text })
  return { ...state, phases: adapters.store.read()!.phases }
}
