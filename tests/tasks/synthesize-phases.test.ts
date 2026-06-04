import { describe, it, expect, vi } from 'vitest'
import { handleSynthesizePhases } from '../../src/tasks/synthesize-phases.js'
import type { PlanState, Task } from '../../src/types.js'
import type { Adapters } from '../../src/types.js'
import type { Store } from '../../src/types.js'

function makeState(): PlanState {
  return {
    brief: 'Build something.',
    recon: 'Some recon.',
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
  }
}

function makeStore(state: PlanState): Store {
  let stored = state
  return {
    read: vi.fn(() => stored),
    write: vi.fn((s) => {
      stored = s
    }),
  }
}

describe('handleSynthesizePhases', () => {
  it('calls onUsage with the correct taskType after the recipe runs', async () => {
    const state = makeState()
    const store = makeStore(state)
    const onUsage = vi.fn()

    const runner = {
      run: vi.fn(async () => ({
        text: '1. Phase One\n2. Phase Two',
        usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [],
      onUsage,
    }

    const task: Task = { type: 'synthesize-phases' }
    await handleSynthesizePhases(task, state, adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'synthesize-phases', inputTokens: 10 }),
    )
  })

  it('does not error when onUsage is not provided', async () => {
    const state = makeState()
    const store = makeStore(state)

    const runner = {
      run: vi.fn(async () => ({
        text: '1. Phase One',
        usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [],
    }

    const task: Task = { type: 'synthesize-phases' }
    await expect(handleSynthesizePhases(task, state, adapters)).resolves.not.toThrow()
  })
})
