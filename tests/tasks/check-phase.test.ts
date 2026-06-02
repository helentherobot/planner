import { describe, it, expect, vi } from 'vitest'
import { handleCheckPhase } from '@/tasks/check-phase.js'
import type { PlanState, Task, PhaseState } from '@/types.js'
import type { Adapters } from '@/types.js'
import type { QualityControl } from '@/types.js'
import type { Store } from '@/types.js'

function makePhaseState(overrides: Partial<PhaseState> = {}): PhaseState {
  return {
    title: 'Test Phase',
    brief: 'Do some things.',
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

describe('handleCheckPhase', () => {
  it('runs all controls in parallel and queues investigate when issues are raised', async () => {
    const phase = makePhaseState()
    const state = makeState([phase])
    const store = makeStore(state)

    const control1: QualityControl = {
      name: 'vagueness',
      checkRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
      investigateRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
    }
    const control2: QualityControl = {
      name: 'scope',
      checkRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
      investigateRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
    }

    let callCount = 0
    const runner = {
      run: vi.fn(async () => {
        callCount++
        return {
          text: JSON.stringify({ findings: [{ path: 'some step', reason: 'too vague' }] }),
          usage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
        }
      }),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [control1, control2],
    }

    const result = await handleCheckPhase({ type: 'check-phase', phase: 0 }, state, adapters)

    expect(callCount).toBe(2)
    expect(result.remainingTasks[0]?.type).toBe('investigate-phase')
  })

  it('does not queue investigate when all controls are clean', async () => {
    const phase = makePhaseState()
    const state = makeState([phase])
    const store = makeStore(state)

    const control: QualityControl = {
      name: 'vagueness',
      checkRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
      investigateRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
    }

    const runner = {
      run: vi.fn(async () => ({
        text: JSON.stringify({ findings: [] }),
        usage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [control],
    }

    const result = await handleCheckPhase({ type: 'check-phase', phase: 0 }, state, adapters)

    expect(result.remainingTasks).toHaveLength(0)
  })

  it('passes otherPhases as empty array when no other phases have a non-empty index', async () => {
    const phase = makePhaseState()
    const state = makeState([phase])
    const store = makeStore(state)

    const control: QualityControl = {
      name: 'vagueness',
      checkRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
      investigateRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
    }

    const runner = {
      run: vi.fn(async () => ({
        text: JSON.stringify({ findings: [] }),
        usage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [control],
    }

    await handleCheckPhase({ type: 'check-phase', phase: 0 }, state, adapters)

    const [, args] = (runner.run as ReturnType<typeof vi.fn>).mock.calls[0]
    const [context] = args
    expect(context.otherPhases).toEqual([])
  })

  it('calls onUsage once per control with controlName set', async () => {
    const phase = makePhaseState()
    const state = makeState([phase])
    const store = makeStore(state)

    const control1: QualityControl = {
      name: 'vagueness',
      checkRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
      investigateRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
    }
    const control2: QualityControl = {
      name: 'scope',
      checkRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
      investigateRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
    }

    const runner = {
      run: vi.fn(async () => ({
        text: JSON.stringify({ findings: [] }),
        usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
      })),
    } as unknown as Adapters['tools']['runner']

    const onUsage = vi.fn()

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [control1, control2],
      onUsage,
    }

    await handleCheckPhase({ type: 'check-phase', phase: 0 }, state, adapters)

    expect(onUsage).toHaveBeenCalledTimes(2)
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'check-phase',
        controlName: 'vagueness',
        inputTokens: 10,
      }),
    )
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'check-phase', controlName: 'scope', inputTokens: 10 }),
    )
  })

  it('passes otherPhases containing indexed sibling phases to the recipe context', async () => {
    const phase0 = makePhaseState({ title: 'Setup', index: 'src/setup.ts\nsrc/config.ts' })
    const phase1 = makePhaseState({ title: 'Feature' })
    const state = makeState([phase0, phase1])
    const store = makeStore(state)

    const control: QualityControl = {
      name: 'scope',
      checkRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
      investigateRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
    }

    const runner = {
      run: vi.fn(async () => ({
        text: JSON.stringify({ findings: [] }),
        usage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [control],
    }

    await handleCheckPhase({ type: 'check-phase', phase: 1 }, state, adapters)

    const [, args] = (runner.run as ReturnType<typeof vi.fn>).mock.calls[0]
    const [context] = args
    expect(context.otherPhases).toHaveLength(1)
    expect(context.otherPhases[0].index).toBe(0)
    expect(context.otherPhases[0].title).toBe('Setup')
    expect(context.otherPhases[0].fileIndex).toBe('src/setup.ts\nsrc/config.ts')
  })
})
