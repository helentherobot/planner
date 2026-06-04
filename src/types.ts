import type { Recipe, Runner, DiscoverableTool } from '@helentherobot/runner'

export interface Config {
  maxFilesPerPhase: number
  minimumIterations: number
  maximumIterations: number
  taskProfiles?: Record<string, string | (() => string | Promise<string>)>
}

export interface ControlFinding {
  path: string
  reason: string
}

/**
 * Persisted memory for a single QualityControl across check/investigate cycles.
 * `dismissed` accumulates false-positive findings with their reason. Same path + same
 * reason → excluded on next check; same path + different reason → warning (new concern
 * about a previously cleared item).
 * `raised` collects confirmed problems batch-fed into revise, then cleared after revise runs.
 */
export interface ControlState {
  dismissed: ControlFinding[]
  raised: ControlFinding[]
}

/**
 * State for a single phase. `controls` is keyed by QualityControl.name so
 * new controls are accommodated without a schema change.
 * `prompt` and `index` are set progressively as the phase moves through formatting.
 */
export interface PhaseState {
  title: string
  brief: string
  prompt?: string
  index?: string
  controls: Record<string, ControlState>
  iterations: number
}

/**
 * A unit of work in the orchestration queue.
 * Built-in tasks use `type`, `phase`, and `iteration`.
 * Consumers may add their own fields via the index signature.
 */
export interface Task {
  type: string
  phase?: number
  iteration?: number
  [key: string]: unknown
}

export interface Question {
  id: string
  question: string
  context?: string
}

export interface PhaseQuestion extends Question {
  phaseIndex: number | number[]
}

export interface AnsweredQuestion extends Question {
  answer: string
  phaseIndex?: number | number[]
}

export interface Answer {
  questionId: string
  answer: string
}

/**
 * The full serialisable state of a plan run.
 * `phases` is ordered — array index is the phase number; insert anywhere to support splits.
 * Timestamps are unix (ms).
 */
export interface PlanState {
  brief: string
  recon: string
  startedAt: number
  completedAt: number | null
  currentTask: Task | null
  progressHandle: unknown
  phases: PhaseState[]
  remainingTasks: Task[]
  completedTasks: Task[]
  awaitingQuestions: Question[]
  answeredQuestions: AnsweredQuestion[]
  pendingQuestions: PhaseQuestion[]
}

export interface OtherPhaseContext {
  index: number
  title: string
  fileIndex: string
}

export interface ControlRecipeContext {
  phase: number
  iteration: number
  phaseState: PhaseState
  controlState: ControlState
  otherPhases: OtherPhaseContext[]
}

export interface UsageEvent {
  taskType: string
  controlName?: string
  inputTokens: number
  outputTokens: number
  totalCostUsd?: number
}

export interface QualityControl {
  name: string
  checkRecipe: Recipe<[context: ControlRecipeContext]>
  investigateRecipe: Recipe<[context: ControlRecipeContext]>
  afterInvestigate?: (
    dismissed: ControlFinding[],
    phase: number,
    store: Store,
  ) => void | Promise<void>
}

export interface Store {
  read(): PlanState | null
  write(state: PlanState): void
}

export interface ProgressEvent {
  brief: string
  completedTasks: Task[]
  totalTasks: number
  currentTask: Task | null
  isComplete: boolean
}

export interface Observer<THandle = unknown> {
  start(event: ProgressEvent): Promise<THandle>
  update(handle: THandle, event: ProgressEvent): Promise<void>
  complete(handle: THandle, event: ProgressEvent): Promise<void>
}

export interface Tools {
  runner: Runner
  profile: string
  cwd: string
  tools: DiscoverableTool[]
  taskTools?: Record<string, DiscoverableTool[]>
}

export interface Adapters {
  tools: Tools
  store: Store
  observer: Observer
  config: Config
  controls: QualityControl[]
  onUsage?: (event: UsageEvent) => void
}
