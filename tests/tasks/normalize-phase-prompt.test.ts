import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleNormalizePhasePrompt } from '../../src/tasks/normalize-phase-prompt.js'
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
    brief: 'Write a detailed implementation plan for the feature.',
    controls: {},
    iterations: 0,
    ...overrides,
  }
}

function makeState(phases: PhaseState[]): PlanState {
  return {
    brief: 'brief',
    recon: 'recon content',
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

const LONG_TEXT = 'Write a detailed implementation plan for... '.repeat(8)
const task: Task = { type: 'normalize-phase-prompt', phase: 0 }

describe('handleNormalizePhasePrompt', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('normal path: valid output stores prompt and returns updated state', async () => {
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

    await handleNormalizePhasePrompt(task, state, adapters)

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

    await handleNormalizePhasePrompt(task, state, adapters)

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
      handleNormalizePhasePrompt(task, state, adapters),
    ).rejects.toThrow('normalize-phase-prompt-validation-failed')
    expect(mockSend).toHaveBeenCalledTimes(3)
  })
})
