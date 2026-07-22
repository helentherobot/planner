import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleIndexPhase } from '../../src/tasks/index-phase.js'
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
    brief: 'Create src/foo.ts and src/bar.ts with the feature implementation.',
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

const FILE_LIST = 'src/foo.ts\nsrc/bar.ts'
const task: Task = { type: 'index-phase', phase: 0 }

describe('handleIndexPhase', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('normal path: valid output stores index and returns updated state', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult(FILE_LIST))
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

    await handleIndexPhase(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(store.write).toHaveBeenCalled()
  })

  it('retry path: first call returns empty, second returns valid file list', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult(''))
      .mockResolvedValueOnce(makeSendResult(FILE_LIST))

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

    await handleIndexPhase(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('exhausted retries: all calls return empty output, throws', async () => {
    mockSend.mockResolvedValue(makeSendResult(''))

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

    await expect(handleIndexPhase(task, state, adapters)).rejects.toThrow(
      'index-phase-validation-failed',
    )
    expect(mockSend).toHaveBeenCalledTimes(3)
  })

  it('calls onUsage after each send', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult(''))
      .mockResolvedValueOnce(makeSendResult(FILE_LIST))

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

    await handleIndexPhase(task, state, adapters)

    expect(onUsage).toHaveBeenCalledTimes(2)
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'index-phase' }),
    )
  })
})
