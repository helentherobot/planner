import type { Task, PlanState, ControlState } from '../types.js'
import type { Adapters } from '../adapters.js'
import { updateControl } from '../store-helpers.js'

export async function handleCheckPhase(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]
  const iteration = phaseState.iterations

  await Promise.all(
    adapters.controls.map(async (control) => {
      const controlState: ControlState = phaseState.controls[control.name] ?? {
        dismissed: [],
        raised: [],
      }
      const result = await adapters.tools.runner.run(control.checkRecipe, [
        { phase, iteration, phaseState, controlState },
      ])
      const text = result.text.trim()
      if (text === '(clean)') return

      const issues = text
        .split('\n')
        .map((l) => l.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)

      if (issues.length > 0) {
        updateControl(adapters.store, phase, control.name, {
          raised: [...controlState.raised, ...issues],
        })
      }
    }),
  )

  const updatedState = adapters.store.read()!
  const updatedPhase = updatedState.phases[phase]
  const anyRaised = adapters.controls.some(
    (c) => (updatedPhase.controls[c.name]?.raised?.length ?? 0) > 0,
  )

  if (anyRaised) {
    const investigateTask: Task = { type: 'investigate-phase', phase }
    return {
      ...updatedState,
      remainingTasks: [investigateTask, ...updatedState.remainingTasks],
    }
  }

  return updatedState
}
