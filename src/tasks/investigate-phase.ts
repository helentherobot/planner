import type { Task, PlanState, ControlState, ControlFinding } from '@/types.js'
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
        [{ phase, iteration, phaseState, controlState }],
      )

      let parsed: { confirmed: string[]; dismissed: ControlFinding[] }
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

      const newDismissals: ControlFinding[] = (parsed.dismissed ?? []).map((d) => ({
        path: String(d.path ?? '').trim(),
        reason: String(d.reason ?? '').trim(),
      }))
      const confirmedPaths = new Set(parsed.confirmed ?? [])

      const existingPaths = new Set(controlState.dismissed.map((d) => d.path))
      for (const d of newDismissals) {
        const existing = controlState.dismissed.find((e) => e.path === d.path)
        if (existing && existing.reason !== d.reason) {
          console.warn(
            `investigate-phase: "${d.path}" dismissed again with a different reason.\n  Before: "${existing.reason}"\n  Now: "${d.reason}"`,
          )
        }
      }

      const confirmedFindings = controlState.raised.filter((f) => confirmedPaths.has(f.path))
      const trulyNewDismissals = newDismissals.filter((d) => !existingPaths.has(d.path))

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
