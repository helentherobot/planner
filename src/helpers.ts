import type {
  Recipe,
  Runner,
  DiscoverableTool,
  ModelMessage,
  TextPart,
} from '@helentherobot/runner'
import type {
  Store,
  PlanState,
  PhaseState,
  ControlState,
  Task,
  Adapters,
  TaskOptions,
  TaskValidationEntry,
} from './types.js'

type UsageCtx = {
  onUsage: Adapters['onUsage']
  taskType: string
  controlName?: string
}

export async function resolveProfile(
  adapters: {
    tools: { profile: string }
    config: {
      taskProfiles?: Record<string, string | (() => string | Promise<string>)>
    }
  },
  taskType: string,
  recipeProfile?: string,
): Promise<string> {
  const entry = adapters.config.taskProfiles?.[taskType]
  if (entry !== undefined) return typeof entry === 'function' ? entry() : entry
  if (recipeProfile) return recipeProfile
  return adapters.tools.profile
}

export function resolveOptions(
  adapters: {
    config: {
      taskOptions?: Record<string, TaskOptions>
    }
  },
  taskType: string,
): TaskOptions {
  return adapters.config.taskOptions?.[taskType] ?? {}
}

export function resolveTools(
  adapters: {
    tools: {
      tools: DiscoverableTool[]
      taskTools?: Record<string, DiscoverableTool[]>
    }
  },
  taskType: string,
): DiscoverableTool[] {
  return adapters.tools.taskTools?.[taskType] ?? adapters.tools.tools
}

export async function runRecipe<TArgs extends unknown[]>(
  runner: Runner,
  profile: string,
  recipe: Recipe<TArgs>,
  args: TArgs,
  usageCtx?: UsageCtx,
) {
  const taskStartedAt = Date.now()
  const result = await runner.run({ ...recipe, profile }, args)
  const taskDurationMs = Date.now() - taskStartedAt
  usageCtx?.onUsage?.({
    taskType: usageCtx.taskType,
    controlName: usageCtx.controlName,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    totalCostUsd: result.usage.totalCostUsd,
    ...(result.usage.reasoningTokens != null
      ? { reasoningTokens: result.usage.reasoningTokens }
      : {}),
    ...(result.usage.cachedInputTokens != null
      ? { cachedInputTokens: result.usage.cachedInputTokens }
      : {}),
    taskStartedAt,
    taskDurationMs,
  })
  return result
}

export const phaseTaskOrder: string[] = [
  'normalize-phase-prompt',
  'plan-phase',
  'normalize-phase-plan',
  'index-phase',
  'split-phase',
  'check-phase',
  'collect-feedback',
  'gather-phase-questions',
  'resolve-phase-questions',
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

export function readClaimedFiles(
  phases: PhaseState[],
  currentPhase: number,
): string[] {
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
    remainingTasks: [
      { type: 'gather-recon' },
      { type: 'gather-questions' },
      { type: 'synthesize-phases' },
    ],
    completedTasks: [],
    awaitingQuestions: [],
    answeredQuestions: [],
    pendingQuestions: [],
  }
}

export function updatePhase(
  store: Store,
  index: number,
  update: Partial<PhaseState>,
): void {
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
  phase.controls[name] = {
    ...(phase.controls[name] ?? { dismissed: [], raised: [] }),
    ...update,
  }
  store.write(state)
}

export function validateOutput(
  entry: TaskValidationEntry | undefined,
  output: string,
): { valid: boolean; retryPrompt: string } {
  if (!entry) return { valid: true, retryPrompt: '' }

  if (entry.type === 'minLength') {
    const valid = output.length >= entry.value
    return {
      valid,
      retryPrompt: valid
        ? ''
        : `The previous response was too short (below the required ` +
          `minimum of ${entry.value} characters). Produce a thorough, ` +
          `complete response of at least ${entry.value} characters.`,
    }
  }

  if (entry.type === 'minItems') {
    const lines = output.split('\n').filter((l) => l.trim().length > 0)
    const valid = lines.length >= entry.value
    return {
      valid,
      retryPrompt: valid
        ? ''
        : `The previous response did not produce enough phase titles. ` +
          `Produce a complete ordered list of implementation phases.`,
    }
  }

  if (entry.type === 'schema') {
    try {
      const parsed = JSON.parse(output)
      const missing = entry.required.filter((k) => !(k in parsed))
      const valid = missing.length === 0
      return {
        valid,
        retryPrompt: valid
          ? ''
          : `The previous response did not match the required format. ` +
            `Return valid JSON containing the required fields: ` +
            `${entry.required.join(', ')}.`,
      }
    } catch {
      return {
        valid: false,
        retryPrompt:
          `The previous response was not valid JSON. Return a JSON ` +
          `object containing the required fields: ` +
          `${entry.required.join(', ')}.`,
      }
    }
  }

  return { valid: true, retryPrompt: '' }
}

export function extractText(messages: ModelMessage[]): string {
  const last = messages.at(-1)
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  if (!Array.isArray(last.content)) return ''
  return (last.content as TextPart[])
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

export const defaultTaskValidation: Record<string, TaskValidationEntry> = {
  'gather-recon': { type: 'minLength', value: 500, maxRetries: 2 },
  'plan-phase': { type: 'minLength', value: 800, maxRetries: 2 },
  'normalize-phase-plan': { type: 'minLength', value: 200, maxRetries: 2 },
  'normalize-phase-prompt': { type: 'minLength', value: 300, maxRetries: 2 },
  'synthesize-phases': { type: 'minItems', value: 1, maxRetries: 2 },
  'resolve-phase-questions': {
    type: 'schema',
    required: ['result'],
    maxRetries: 2,
  },
  'index-phase': { type: 'minLength', value: 10, maxRetries: 2 },
  'check-recon': { type: 'schema', required: ['pass', 'gap'], maxRetries: 2 },
  'check-synthesis': {
    type: 'schema',
    required: ['pass', 'gap'],
    maxRetries: 2,
  },
  'cross-phase-check': {
    type: 'schema',
    required: ['findings'],
    maxRetries: 2,
  },
  'extract-schema': { type: 'schema', required: ['tables'], maxRetries: 2 },
}

export function mergeTaskValidation(
  overrides?: Record<string, TaskValidationEntry>,
): Record<string, TaskValidationEntry> {
  return { ...defaultTaskValidation, ...overrides }
}
