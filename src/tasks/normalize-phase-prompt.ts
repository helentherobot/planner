import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../adapters.js'
import { normalizePhasePrompt as normalizePhasePromptRecipe } from '../recipes/normalize-phase-prompt.js'
import { updatePhase } from '../store-helpers.js'

export async function handleNormalizePhasePrompt(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]
  const result = await adapters.tools.runner.run(normalizePhasePromptRecipe, [
    { phase, phaseState },
  ])
  updatePhase(adapters.store, phase, { prompt: result.text })
  return { ...state, phases: adapters.store.read()!.phases }
}
