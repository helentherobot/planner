import type { Task, PlanState, ControlState, ControlFinding, OtherPhaseContext } from '@/types.js'

import type { Adapters } from '@/types.js'
import { resolveProfile, runRecipe, updateControl } from '@/helpers.js'

export async function handleCheckPhase(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]
  const iteration = phaseState.iterations

  const otherPhases: OtherPhaseContext[] = state.phases
    .map((p, i) => ({ index: i, title: p.title, fileIndex: p.index ?? '' }))
    .filter((p) => p.index !== phase && p.fileIndex.length > 0)

  await Promise.all(
    adapters.controls.map(async (control) => {
      const controlState: ControlState = phaseState.controls[control.name] ?? {
        dismissed: [],
        raised: [],
      }
      const result = await runRecipe(
        adapters.tools.runner,
        await resolveProfile(adapters, task.type, control.checkRecipe.profile),
        control.checkRecipe,
        [{ phase, iteration, phaseState, controlState, otherPhases }],
        { onUsage: adapters.onUsage, taskType: task.type, controlName: control.name },
      )

      let parsed: { findings: ControlFinding[] }
      try {
        const text = result.text
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
        parsed = JSON.parse(text)
      } catch {
        console.warn(`check-phase: failed to parse result for control "${control.name}"`)
        return
      }

      const newFindings = parsed.findings ?? []

      if (newFindings.length > 0) {
        updateControl(adapters.store, phase, control.name, {
          raised: [...controlState.raised, ...newFindings],
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
    const alreadyQueued = state.remainingTasks.some(
      (t) => t.type === 'investigate-phase' && t.phase === phase,
    )
    if (alreadyQueued) return { ...updatedState, remainingTasks: state.remainingTasks }
    const investigateTask: Task = { type: 'investigate-phase', phase }
    return {
      ...updatedState,
      remainingTasks: [investigateTask, ...state.remainingTasks],
    }
  }

  return { ...updatedState, remainingTasks: state.remainingTasks }
}
