import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handlePlanPhase } from '../../src/tasks/plan-phase.js'
import type { PlanState, Task, PhaseState } from '../../src/types.js'
import type { Adapters } from '../../src/types.js'
import type { Store } from '../../src/types.js'

vi.mock('@helentherobot/runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@helentherobot/runner')>()
  return {
    ...actual,
    send: vi.fn(),
  }
})

import { send } from '@helentherobot/runner'
const mockSend = send as ReturnType<typeof vi.fn>

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

function makeSendResult(text = '') {
  return {
    messages: text ? [{ role: 'assistant' as const, content: text }] : [],
    usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
  }
}

describe('handlePlanPhase', () => {
  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue(makeSendResult('The plan.'))
  })

  it('sends phaseState.brief when no other phases have a non-empty index', async () => {
    const phase = makePhaseState()
    const state = makeState([phase])
    const store = makeStore(state)

    const adapters: Adapters = {
      tools: {
        runner: {} as Adapters['tools']['runner'],
        profile: 'haiku',
        cwd: '/tmp',
        tools: [],
      },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [],
    }

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).toBe('Do some things.')
  })

  it('sends phaseState.prompt (over brief) when no cross-phase context', async () => {
    const phase = makePhaseState({ prompt: 'Custom prompt.' })
    const state = makeState([phase])
    const store = makeStore(state)

    const adapters: Adapters = {
      tools: {
        runner: {} as Adapters['tools']['runner'],
        profile: 'haiku',
        cwd: '/tmp',
        tools: [],
      },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [],
    }

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).toBe('Custom prompt.')
  })

  it('excludes another phase when its index is empty', async () => {
    const phase0 = makePhaseState({ title: 'Phase One', index: '' })
    const phase1 = makePhaseState({ title: 'Phase Two', brief: 'Do other things.' })
    const state = makeState([phase0, phase1])
    const store = makeStore(state)

    const adapters: Adapters = {
      tools: {
        runner: {} as Adapters['tools']['runner'],
        profile: 'haiku',
        cwd: '/tmp',
        tools: [],
      },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [],
    }

    await handlePlanPhase({ type: 'plan-phase', phase: 1 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).toBe('Do other things.')
    expect(messages[0]).not.toContain('Other phases already planned')
  })

  it('prepends cross-phase block when another phase has a non-empty index', async () => {
    const phase0 = makePhaseState({ title: 'Setup', index: 'src/setup.ts\nsrc/config.ts' })
    const phase1 = makePhaseState({ title: 'Feature', brief: 'Build the feature.' })
    const state = makeState([phase0, phase1])
    const store = makeStore(state)

    const adapters: Adapters = {
      tools: {
        runner: {} as Adapters['tools']['runner'],
        profile: 'haiku',
        cwd: '/tmp',
        tools: [],
      },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [],
    }

    await handlePlanPhase({ type: 'plan-phase', phase: 1 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).toContain('Other phases already planned')
    expect(messages[0]).toContain('Phase 1 — Setup')
    expect(messages[0]).toContain('src/setup.ts')
    expect(messages[0]).toContain('src/config.ts')
    expect(messages[0]).toContain('Build the feature.')
  })

  it('calls onUsage after send resolves', async () => {
    const phase = makePhaseState()
    const state = makeState([phase])
    const store = makeStore(state)
    const onUsage = vi.fn()

    const adapters: Adapters = {
      tools: {
        runner: {} as Adapters['tools']['runner'],
        profile: 'haiku',
        cwd: '/tmp',
        tools: [],
      },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [],
      onUsage,
    }

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'plan-phase', inputTokens: 10 }),
    )
  })

  it('does not include the current phase in the cross-phase block', async () => {
    const phase0 = makePhaseState({
      title: 'Current',
      index: 'src/current.ts',
      brief: 'Current work.',
    })
    const phase1 = makePhaseState({ title: 'Other', index: 'src/other.ts' })
    const state = makeState([phase0, phase1])
    const store = makeStore(state)

    const adapters: Adapters = {
      tools: {
        runner: {} as Adapters['tools']['runner'],
        profile: 'haiku',
        cwd: '/tmp',
        tools: [],
      },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [],
    }

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).not.toContain('src/current.ts')
    expect(messages[0]).toContain('src/other.ts')
  })
})
