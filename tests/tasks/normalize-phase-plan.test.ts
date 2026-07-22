import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleNormalizePhasePlan } from '../../src/tasks/normalize-phase-plan.js'
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
    brief: 'Original plan content that is very detailed and thorough.',
    controls: {},
    iterations: 0,
    ...overrides,
  }
}

function makeState(phases: PhaseState[]): PlanState {
  return {
    brief: 'brief',
    recon: '',
    startedAt: Date.now(),
    completedAt: null,
    currentTask: null,
    progressHandle: null,
    phases,
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

function makeSendResult(text: string) {
  return {
    messages: [{ role: 'assistant' as const, content: text }],
    usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
  }
}

const LONG_TEXT = 'Cleaned up plan. '.repeat(15)
const task: Task = { type: 'normalize-phase-plan', phase: 0 }

describe('handleNormalizePhasePlan', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('normal path: valid output stores brief and returns updated state', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult(LONG_TEXT))
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
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
      },
      controls: [],
    }

    await handleNormalizePhasePlan(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(store.write).toHaveBeenCalled()
  })

  it('retry path: first call returns short output, second returns valid', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult('short'))
      .mockResolvedValueOnce(makeSendResult(LONG_TEXT))

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
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
      },
      controls: [],
    }

    await handleNormalizePhasePlan(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('exhausted retries: all calls return invalid output, throws', async () => {
    mockSend.mockResolvedValue(makeSendResult('x'))

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
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
      },
      controls: [],
    }

    await expect(
      handleNormalizePhasePlan(task, state, adapters),
    ).rejects.toThrow('normalize-phase-plan-validation-failed')
    expect(mockSend).toHaveBeenCalledTimes(3)
  })

  it('schemaFirst true, phase 0: prepends extract-schema to remainingTasks', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult(LONG_TEXT))
    const phase = makePhaseState()
    const state = {
      ...makeState([phase]),
      remainingTasks: [{ type: 'plan-phase', phase: 0 }],
    }
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
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
        schemaFirst: true,
      },
      controls: [],
    }

    const result = await handleNormalizePhasePlan(task, state, adapters)

    expect(result.remainingTasks[0]).toEqual({
      type: 'extract-schema',
      phase: 0,
    })
    expect(result.remainingTasks[1]).toEqual({ type: 'plan-phase', phase: 0 })
  })

  it('schemaFirst false: does not inject extract-schema', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult(LONG_TEXT))
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
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
        schemaFirst: false,
      },
      controls: [],
    }

    const result = await handleNormalizePhasePlan(task, state, adapters)

    expect(result.remainingTasks.some((t) => t.type === 'extract-schema')).toBe(
      false,
    )
  })

  it('schemaFirst true, phase 1: does not inject extract-schema', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult(LONG_TEXT))
    const phase = makePhaseState()
    const state = makeState([phase, phase])
    const store = makeStore(state)
    const phase1Task: Task = { type: 'normalize-phase-plan', phase: 1 }

    const adapters: Adapters = {
      tools: {
        runner: {} as Adapters['tools']['runner'],
        profile: 'haiku',
        cwd: '/tmp',
        tools: [],
      },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
        schemaFirst: true,
      },
      controls: [],
    }

    const result = await handleNormalizePhasePlan(phase1Task, state, adapters)

    expect(result.remainingTasks.some((t) => t.type === 'extract-schema')).toBe(
      false,
    )
  })

  it('calls onUsage after each send', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult('x'))
      .mockResolvedValueOnce(makeSendResult(LONG_TEXT))

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
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
      },
      controls: [],
      onUsage,
    }

    await handleNormalizePhasePlan(task, state, adapters)

    expect(onUsage).toHaveBeenCalledTimes(2)
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'normalize-phase-plan' }),
    )
  })
})
