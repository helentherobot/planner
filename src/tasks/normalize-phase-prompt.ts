import type { Task, PlanState } from '@/types.js'
import type { Adapters } from '@/types.js'
import { normalizePhasePrompt as normalizePhasePromptRecipe } from '@/recipes/normalize-phase-prompt.js'
import { resolveProfile, runRecipe, updatePhase } from '@/helpers.js'

export async function handleNormalizePhasePrompt(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]
  const result = await runRecipe(
    adapters.tools.runner,
    await resolveProfile(adapters, task.type, normalizePhasePromptRecipe.profile),
    normalizePhasePromptRecipe,
    [{ phase, phaseState, recon: state.recon }],
  )
  updatePhase(adapters.store, phase, { prompt: result.text })
  return { ...state, phases: adapters.store.read()!.phases }
}
