import type { Task, PlanState } from '@/types.js'
import type { Adapters } from '@/types.js'
import { resolveProfile, runRecipe, updatePhase } from '@/helpers.js'
import { prompt } from '@/prompts/index-phase/recipe.js'

export async function handleIndexPhase(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]
  const result = await runRecipe(
    adapters.tools.runner,
    await resolveProfile(adapters, task.type),
    { profile: '', prompt },
    [{ phase, phaseState }],
  )
  updatePhase(adapters.store, phase, { index: result.text })
  return { ...state, phases: adapters.store.read()!.phases }
}
