import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../types.js'
import {
  resolveProfile,
  runRecipe,
  updatePhase,
  updateControl,
} from '../helpers.js'
import { prompt } from '../prompts/revise-phase/recipe.js'

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
      allIssues.push(
        ...controlState.raised.map((f) => `${f.path} — ${f.reason}`),
      )
    }
  }

  if (allIssues.length === 0) {
    return state
  }

  const result = await runRecipe(
    adapters.tools.runner,
    await resolveProfile(adapters, task.type),
    { profile: '', prompt },
    [
      {
        phase,
        phaseState,
        issues: allIssues,
        answeredQuestions: state.answeredQuestions,
      },
    ],
    { onUsage: adapters.onUsage, taskType: task.type },
  )

  updatePhase(adapters.store, phase, { brief: result.text })

  for (const control of adapters.controls) {
    const controlState = phaseState.controls[control.name]
    if (controlState?.raised?.length) {
      updateControl(adapters.store, phase, control.name, { raised: [] })
    }
  }

  return { ...adapters.store.read()!, remainingTasks: state.remainingTasks }
}
