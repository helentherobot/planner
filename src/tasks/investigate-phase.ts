import type { Task, PlanState, ControlState } from '@/types.js'
import type { Adapters } from '@/types.js'
import { resolveProfile, runRecipe, updateControl } from '@/helpers.js'

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

      const result = await runRecipe(
        adapters.tools.runner,
        await resolveProfile(adapters, task.type, control.investigateRecipe.profile),
        control.investigateRecipe,
        [{ phase, iteration, phaseState, controlState, otherPhases: [] }],
        { onUsage: adapters.onUsage, taskType: task.type, controlName: control.name },
      )

      let parsed: { confirmed: number[]; dismissed: number[] }
      try {
        const text = result.text
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
        parsed = JSON.parse(text)
      } catch {
        console.warn(`investigate-phase: failed to parse result for control "${control.name}"`)
        return
      }

      const confirmedIndices = new Set((parsed.confirmed ?? []).map(Number))
      const dismissedIndices = new Set((parsed.dismissed ?? []).map(Number))

      const confirmedFindings = controlState.raised.filter((_, i) => confirmedIndices.has(i + 1))
      const newDismissals = controlState.raised.filter((_, i) => dismissedIndices.has(i + 1))

      const existingDismissed = new Set(controlState.dismissed.map((d) => `${d.path}\0${d.reason}`))
      const trulyNewDismissals = newDismissals.filter(
        (d) => !existingDismissed.has(`${d.path}\0${d.reason}`),
      )

      updateControl(adapters.store, phase, control.name, {
        raised: confirmedFindings,
        dismissed: [...controlState.dismissed, ...trulyNewDismissals],
      })

      if (control.afterInvestigate && trulyNewDismissals.length > 0) {
        await control.afterInvestigate(trulyNewDismissals, phase, adapters.store)
      }
    }),
  )

  const updatedState = adapters.store.read()!
  const alreadyQueued = state.remainingTasks.some(
    (t) => t.type === 'collect-feedback' && t.phase === phase,
  )
  if (alreadyQueued) return { ...updatedState, remainingTasks: state.remainingTasks }
  const collectTask: Task = { type: 'collect-feedback', phase }
  return {
    ...updatedState,
    remainingTasks: [collectTask, ...state.remainingTasks],
  }
}
