import { describe, it, expect, vi } from 'vitest'
import { handleSplitPhase } from '@/tasks/split-phase.js'
import type { PlanState, Task, PhaseState } from '@/types.js'
import type { Adapters } from '@/types.js'
import type { Store } from '@/types.js'

function makePhaseState(overrides: Partial<PhaseState> = {}): PhaseState {
  return {
    title: 'Big Phase',
    brief: 'Do many things.',
    controls: {},
    iterations: 0,
    ...overrides,
  }
}

function makeState(phases: PhaseState[], remaining: Task[] = []): PlanState {
  return {
    brief: 'brief',
    recon: '',
    startedAt: Date.now(),
    completedAt: null,
    currentTask: null,
    progressHandle: null,
    phases,
    remainingTasks: remaining,
    completedTasks: [],
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

const splitResult = JSON.stringify([
  { title: 'Phase A', brief: 'First half' },
  { title: 'Phase B', brief: 'Second half' },
])

describe('handleSplitPhase', () => {
  it('does not split when file count is within limit', async () => {
    const phase = makePhaseState({ index: 'src/a.ts\nsrc/b.ts' })
    const state = makeState([phase])
    const store = makeStore(state)

    const runner = { run: vi.fn() } as unknown as Adapters['tools']['runner']
    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      controls: [],
      config: { maxFilesPerPhase: 2, minimumIterations: 1, maximumIterations: 5 },
    }

    const result = await handleSplitPhase({ type: 'split-phase', phase: 0 }, state, adapters)

    expect(runner.run).not.toHaveBeenCalled()
    expect(result.phases).toHaveLength(1)
  })

  it('splits when file count exceeds limit', async () => {
    const index = 'src/a.ts\nsrc/b.ts\nsrc/c.ts'
    const phase = makePhaseState({ index })
    const state = makeState([phase])
    const store = makeStore(state)

    const runner = {
      run: vi.fn(async () => ({
        text: splitResult,
        usage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      controls: [],
      config: { maxFilesPerPhase: 2, minimumIterations: 1, maximumIterations: 5 },
    }

    const result = await handleSplitPhase({ type: 'split-phase', phase: 0 }, state, adapters)

    expect(result.phases).toHaveLength(2)
    expect(result.phases[0].title).toBe('Phase A')
    expect(result.phases[1].title).toBe('Phase B')
  })

  it('calls onUsage when the split branch runs', async () => {
    const index = 'src/a.ts\nsrc/b.ts\nsrc/c.ts'
    const phase = makePhaseState({ index })
    const state = makeState([phase])
    const store = makeStore(state)

    const runner = {
      run: vi.fn(async () => ({
        text: splitResult,
        usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
      })),
    } as unknown as Adapters['tools']['runner']

    const onUsage = vi.fn()

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      controls: [],
      config: { maxFilesPerPhase: 2, minimumIterations: 1, maximumIterations: 5 },
      onUsage,
    }

    await handleSplitPhase({ type: 'split-phase', phase: 0 }, state, adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'split-phase', inputTokens: 10 }),
    )
  })

  it('does not call onUsage when file count is within limit', async () => {
    const phase = makePhaseState({ index: 'src/a.ts\nsrc/b.ts' })
    const state = makeState([phase])
    const store = makeStore(state)

    const runner = { run: vi.fn() } as unknown as Adapters['tools']['runner']
    const onUsage = vi.fn()

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      controls: [],
      config: { maxFilesPerPhase: 2, minimumIterations: 1, maximumIterations: 5 },
      onUsage,
    }

    await handleSplitPhase({ type: 'split-phase', phase: 0 }, state, adapters)

    expect(onUsage).not.toHaveBeenCalled()
  })

  it('queues tasks for new phases after split', async () => {
    const index = 'src/a.ts\nsrc/b.ts\nsrc/c.ts'
    const phase = makePhaseState({ index })
    const state = makeState([phase])
    const store = makeStore(state)

    const runner = {
      run: vi.fn(async () => ({
        text: splitResult,
        usage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      controls: [],
      config: { maxFilesPerPhase: 2, minimumIterations: 1, maximumIterations: 5 },
    }

    const result = await handleSplitPhase({ type: 'split-phase', phase: 0 }, state, adapters)

    expect(result.remainingTasks.length).toBeGreaterThan(0)
    expect(result.remainingTasks.some((t) => t.phase === 0)).toBe(true)
    expect(result.remainingTasks.some((t) => t.phase === 1)).toBe(true)
  })
})
