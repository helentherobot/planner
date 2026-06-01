import type { Task, PlanState, ControlState } from '../types.js'
import type { Adapters } from '../adapters.js'
import { updateControl } from '../store-helpers.js'

export async function handleInvestigatePhase(
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
      if (controlState.raised.length === 0) return

      const result = await adapters.tools.runner.run(control.investigateRecipe, [
        { phase, iteration, phaseState, controlState },
      ])

      let parsed: { confirmed: string[]; dismissed: string[] }
      try {
        parsed = JSON.parse(result.text)
      } catch {
        console.warn(`investigate-phase: failed to parse result for control "${control.name}"`)
        return
      }

      updateControl(adapters.store, phase, control.name, {
        raised: parsed.confirmed ?? [],
        dismissed: [...controlState.dismissed, ...(parsed.dismissed ?? [])],
      })
    }),
  )

  const updatedState = adapters.store.read()!
  const collectTask: Task = { type: 'collect-feedback', phase }
  return {
    ...updatedState,
    remainingTasks: [collectTask, ...updatedState.remainingTasks],
  }
}
