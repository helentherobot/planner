import { describe, it, expect, vi } from 'vitest'
import { handleCleanup } from '../../src/tasks/cleanup.js'
import type { PlanState, Task } from '../../src/types.js'
import type { Adapters } from '../../src/types.js'

function makeState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    brief: 'brief',
    recon: '',
    startedAt: Date.now(),
    completedAt: null,
    currentTask: null,
    progressHandle: null,
    phases: [],
    remainingTasks: [],
    completedTasks: [],
    awaitingQuestions: [],
    answeredQuestions: [],
    pendingQuestions: [],
    ...overrides,
  }
}

function makeAdapters(): Adapters {
  return {
    tools: {
      runner: {} as Adapters['tools']['runner'],
      profile: 'haiku',
      cwd: '/tmp',
      tools: [],
    },
    store: { read: vi.fn(), write: vi.fn() },
    observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
    config: { maxFilesPerPhase: 10, minIterations: 1, maxIterations: 5 },
    controls: [],
  }
}

const task: Task = { type: 'cleanup' }

describe('handleCleanup', () => {
  it('first call: injects cross-phase-check and cleanup, does not set completedAt', async () => {
    const state = makeState()
    const result = await handleCleanup(task, state, makeAdapters())

    expect(result.completedAt).toBeNull()
    expect(result.crossPhaseCheckComplete).toBe(true)
    expect(result.remainingTasks[0].type).toBe('cross-phase-check')
    expect(result.remainingTasks[1].type).toBe('cleanup')
  })

  it('first call: preserves existing remainingTasks after injected tasks', async () => {
    const state = makeState({ remainingTasks: [{ type: 'other-task' }] })
    const result = await handleCleanup(task, state, makeAdapters())

    expect(result.remainingTasks).toHaveLength(3)
    expect(result.remainingTasks[0].type).toBe('cross-phase-check')
    expect(result.remainingTasks[1].type).toBe('cleanup')
    expect(result.remainingTasks[2].type).toBe('other-task')
  })

  it('first call with crossPhaseCheckComplete false: injects tasks', async () => {
    const state = makeState({ crossPhaseCheckComplete: false })
    const result = await handleCleanup(task, state, makeAdapters())

    expect(result.completedAt).toBeNull()
    expect(result.remainingTasks[0].type).toBe('cross-phase-check')
    expect(result.remainingTasks[1].type).toBe('cleanup')
  })

  it('second call with crossPhaseCheckComplete true: sets completedAt', async () => {
    const state = makeState({ crossPhaseCheckComplete: true })
    const result = await handleCleanup(task, state, makeAdapters())

    expect(result.completedAt).not.toBeNull()
    expect(typeof result.completedAt).toBe('number')
    expect(result.remainingTasks).toHaveLength(0)
  })
})
