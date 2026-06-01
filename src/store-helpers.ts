import type { Store } from './store.js'
import type { PlanState, PhaseState, ControlState } from './types.js'

export function createDefaultState(): PlanState {
  return {
    brief: '',
    recon: '',
    startedAt: Date.now(),
    completedAt: null,
    currentTask: null,
    progressHandle: null,
    config: {
      maxFilesPerPhase: 10,
      minimumIterations: 1,
      maximumIterations: 5,
    },
    phases: [],
    remainingTasks: [],
    completedTasks: [],
  }
}

export function updatePhase(store: Store, index: number, update: Partial<PhaseState>): void {
  const state = store.read() ?? createDefaultState()
  state.phases[index] = { ...state.phases[index], ...update }
  store.write(state)
}

export function updateControl(
  store: Store,
  phaseIndex: number,
  name: string,
  update: Partial<ControlState>,
): void {
  const state = store.read() ?? createDefaultState()
  const phase = state.phases[phaseIndex]
  phase.controls[name] = { ...(phase.controls[name] ?? { dismissed: [], raised: [] }), ...update }
  store.write(state)
}
