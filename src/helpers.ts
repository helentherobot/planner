import type { Recipe, Runner, DiscoverableTool } from '@helentherobot/runner'
import type { Store, PlanState, PhaseState, ControlState, Task } from '@/types.js'

export async function resolveProfile(
  adapters: {
    tools: { profile: string }
    config: { taskProfiles?: Record<string, string | (() => string | Promise<string>)> }
  },
  taskType: string,
  recipeProfile?: string,
): Promise<string> {
  const entry = adapters.config.taskProfiles?.[taskType]
  if (entry !== undefined) return typeof entry === 'function' ? entry() : entry
  if (recipeProfile) return recipeProfile
  return adapters.tools.profile
}

export function resolveTools(
  adapters: {
    tools: { tools: DiscoverableTool[]; taskTools?: Record<string, DiscoverableTool[]> }
  },
  taskType: string,
): DiscoverableTool[] {
  return adapters.tools.taskTools?.[taskType] ?? adapters.tools.tools
}

export function runRecipe<TArgs extends unknown[]>(
  runner: Runner,
  profile: string,
  recipe: Recipe<TArgs>,
  args: TArgs,
) {
  return runner.run({ ...recipe, profile }, args)
}

export const phaseTaskOrder: string[] = [
  'normalize-phase-prompt',
  'plan-phase',
  'normalize-phase-plan',
  'index-phase',
  'split-phase',
  'check-phase',
  'collect-feedback',
]

export function expandPhases(phases: string[]): Task[] {
  const tasks: Task[] = []

  for (let i = 0; i < phases.length; i++) {
    for (const type of phaseTaskOrder) {
      tasks.push({ type, phase: i })
    }
  }

  tasks.push({ type: 'cleanup' })

  return tasks
}

export function readClaimedFiles(phases: PhaseState[], currentPhase: number): string[] {
  const claimed: string[] = []

  for (let i = 0; i < phases.length; i++) {
    if (i === currentPhase) continue
    const index = phases[i].index
    if (!index) continue
    for (const line of index.split('\n')) {
      const trimmed = line.trim()
      if (trimmed) claimed.push(trimmed)
    }
  }

  return claimed
}

export function createInitialState(brief: string): PlanState {
  return {
    brief,
    recon: '',
    startedAt: Date.now(),
    completedAt: null,
    currentTask: null,
    progressHandle: null,
    phases: [],
    remainingTasks: [{ type: 'gather-recon' }, { type: 'synthesize-phases' }],
    completedTasks: [],
  }
}

export function updatePhase(store: Store, index: number, update: Partial<PhaseState>): void {
  const state = store.read()
  if (!state) throw new Error('updatePhase: store has no state')
  state.phases[index] = { ...state.phases[index], ...update }
  store.write(state)
}

export function updateControl(
  store: Store,
  phaseIndex: number,
  name: string,
  update: Partial<ControlState>,
): void {
  const state = store.read()
  if (!state) throw new Error('updateControl: store has no state')
  const phase = state.phases[phaseIndex]
  phase.controls[name] = { ...(phase.controls[name] ?? { dismissed: [], raised: [] }), ...update }
  store.write(state)
}
