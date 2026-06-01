export interface Config {
  maxFilesPerPhase: number
  minimumIterations: number
  maximumIterations: number
}

/**
 * Persisted memory for a single QualityControl across check/investigate cycles.
 * `dismissed` accumulates false-positive findings injected into the next check prompt.
 * `raised` collects confirmed problems batch-fed into revise, then cleared after revise runs.
 */
export interface ControlState {
  dismissed: string[]
  raised: string[]
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
  config: Config
  phases: PhaseState[]
  remainingTasks: Task[]
  completedTasks: Task[]
}
