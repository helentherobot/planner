import { describe, it, expect, vi } from 'vitest'
import { handleCheckPhase } from '@/tasks/check-phase.js'
import type { PlanState, Task, PhaseState } from '@/types.js'
import type { Adapters } from '@/adapters.js'
import type { QualityControl } from '@/checks.js'
import type { Store } from '@/store.js'

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
    config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
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
        return { text: '- Some issue', usage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 } }
      }),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', agentTools: {} },
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
        text: '(clean)',
        usage: { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', agentTools: {} },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [control],
    }

    const result = await handleCheckPhase({ type: 'check-phase', phase: 0 }, state, adapters)

    expect(result.remainingTasks).toHaveLength(0)
  })
})
