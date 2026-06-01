import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../adapters.js'
import { indexPhase as indexPhaseRecipe } from '../recipes/index-phase.js'
import { updatePhase } from '../store-helpers.js'

export async function handleIndexPhase(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]
  const result = await adapters.tools.runner.run(indexPhaseRecipe, [{ phase, phaseState }])
  updatePhase(adapters.store, phase, { index: result.text })
  return { ...state, phases: adapters.store.read()!.phases }
}
