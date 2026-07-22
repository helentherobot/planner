import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleResolvePhaseQuestions } from '../../src/tasks/resolve-phase-questions.js'
import type {
  PlanState,
  Task,
  PhaseState,
  PhaseQuestion,
} from '../../src/types.js'
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

function makeState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    brief: 'Build something.',
    recon: 'Some recon.',
    startedAt: Date.now(),
    completedAt: null,
    currentTask: null,
    progressHandle: null,
    phases: [makePhaseState()],
    remainingTasks: [],
    completedTasks: [],
    awaitingQuestions: [],
    answeredQuestions: [],
    pendingQuestions: [],
    ...overrides,
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

function makeAdapters(state: PlanState): Adapters {
  return {
    tools: {
      runner: {} as Adapters['tools']['runner'],
      profile: 'haiku',
      cwd: '/tmp',
      tools: [],
    },
    store: makeStore(state),
    observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
    config: {
      maxFilesPerPhase: 10,
      minIterations: 1,
      maxIterations: 5,
    },
    controls: [],
  }
}

function makeSendResult(json: object) {
  return {
    messages: [{ role: 'assistant' as const, content: JSON.stringify(json) }],
    usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
  }
}

const task: Task = { type: 'resolve-phase-questions', phase: 0 }

describe('handleResolvePhaseQuestions', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('returns state unchanged when there are no pending questions for this phase', async () => {
    const state = makeState()
    const adapters = makeAdapters(state)

    const result = await handleResolvePhaseQuestions(task, state, adapters)

    expect(result).toBe(state)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('moves an answered question from pendingQuestions to answeredQuestions with correct shape', async () => {
    const question: PhaseQuestion = {
      id: 'q-0',
      question: 'Which ORM?',
      phaseIndex: 0,
    }
    const state = makeState({ pendingQuestions: [question] })
    const adapters = makeAdapters(state)

    mockSend.mockResolvedValueOnce(
      makeSendResult({
        result: 'answered',
        answer: 'Drizzle ORM, confirmed in CLAUDE.md.',
      }),
    )

    const result = await handleResolvePhaseQuestions(task, state, adapters)

    expect(result.pendingQuestions).toHaveLength(0)
    expect(result.answeredQuestions).toHaveLength(1)
    expect(result.answeredQuestions[0]).toMatchObject({
      id: 'q-0',
      question: 'Which ORM?',
      answer: 'Drizzle ORM, confirmed in CLAUDE.md.',
      phaseIndex: 0,
    })
  })

  it('updates context on an enriched question and leaves it in pendingQuestions', async () => {
    const question: PhaseQuestion = {
      id: 'q-0',
      question: 'Auth strategy?',
      phaseIndex: 0,
    }
    const state = makeState({ pendingQuestions: [question] })
    const adapters = makeAdapters(state)

    mockSend.mockResolvedValueOnce(
      makeSendResult({
        result: 'enriched',
        context: 'README mentions NextAuth.',
      }),
    )

    const result = await handleResolvePhaseQuestions(task, state, adapters)

    expect(result.pendingQuestions).toHaveLength(1)
    expect(result.pendingQuestions[0].context).toBe('README mentions NextAuth.')
    expect(result.answeredQuestions).toHaveLength(0)
  })

  it('processes two questions: first answered, second enriched; runner called twice; context flows through', async () => {
    const q1: PhaseQuestion = {
      id: 'q-0',
      question: 'Which ORM?',
      phaseIndex: 0,
    }
    const q2: PhaseQuestion = {
      id: 'q-1',
      question: 'Auth strategy?',
      phaseIndex: 0,
    }
    const state = makeState({ pendingQuestions: [q1, q2] })
    const adapters = makeAdapters(state)

    mockSend
      .mockResolvedValueOnce(
        makeSendResult({
          result: 'answered',
          answer: 'Drizzle ORM, confirmed in CLAUDE.md.',
        }),
      )
      .mockResolvedValueOnce(
        makeSendResult({
          result: 'enriched',
          context: 'README mentions NextAuth.',
        }),
      )

    const result = await handleResolvePhaseQuestions(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(result.answeredQuestions).toHaveLength(1)
    expect(result.answeredQuestions[0].id).toBe('q-0')
    expect(result.pendingQuestions).toHaveLength(1)
    expect(result.pendingQuestions[0].id).toBe('q-1')
    expect(result.pendingQuestions[0].context).toBe('README mentions NextAuth.')

    const secondCallMessages = mockSend.mock.calls[1][2]
    expect(secondCallMessages[0]).toContain('Which ORM?')
    expect(secondCallMessages[0]).toContain(
      'Drizzle ORM, confirmed in CLAUDE.md.',
    )
  })

  it('leaves a question unchanged when result is none and loop continues', async () => {
    const q1: PhaseQuestion = {
      id: 'q-0',
      question: 'Cache needed?',
      phaseIndex: 0,
    }
    const q2: PhaseQuestion = {
      id: 'q-1',
      question: 'Which ORM?',
      phaseIndex: 0,
    }
    const state = makeState({ pendingQuestions: [q1, q2] })
    const adapters = makeAdapters(state)

    mockSend
      .mockResolvedValueOnce(makeSendResult({ result: 'none' }))
      .mockResolvedValueOnce(
        makeSendResult({
          result: 'answered',
          answer: 'Drizzle ORM, confirmed in CLAUDE.md.',
        }),
      )

    const result = await handleResolvePhaseQuestions(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(result.pendingQuestions).toHaveLength(1)
    expect(result.pendingQuestions[0].id).toBe('q-0')
    expect(result.answeredQuestions).toHaveLength(1)
    expect(result.answeredQuestions[0].id).toBe('q-1')
  })

  it('includes question with array phaseIndex and preserves array on AnsweredQuestion', async () => {
    const question: PhaseQuestion = {
      id: 'q-0',
      question: 'Which ORM?',
      phaseIndex: [0, 1],
    }
    const state = makeState({ pendingQuestions: [question] })
    const adapters = makeAdapters(state)

    mockSend.mockResolvedValueOnce(
      makeSendResult({
        result: 'answered',
        answer: 'Drizzle ORM, confirmed in CLAUDE.md.',
      }),
    )

    const result = await handleResolvePhaseQuestions(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(result.answeredQuestions).toHaveLength(1)
    expect(result.answeredQuestions[0].phaseIndex).toEqual([0, 1])
  })

  it('calls onUsage once per question with correct taskType and token counts', async () => {
    const q1: PhaseQuestion = {
      id: 'q-0',
      question: 'Which ORM?',
      phaseIndex: 0,
    }
    const q2: PhaseQuestion = {
      id: 'q-1',
      question: 'Auth strategy?',
      phaseIndex: 0,
    }
    const state = makeState({ pendingQuestions: [q1, q2] })
    const onUsage = vi.fn()

    const adapters: Adapters = {
      ...makeAdapters(state),
      onUsage,
    }

    mockSend
      .mockResolvedValueOnce(makeSendResult({ result: 'none' }))
      .mockResolvedValueOnce(makeSendResult({ result: 'none' }))

    await handleResolvePhaseQuestions(task, state, adapters)

    expect(onUsage).toHaveBeenCalledTimes(2)
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'resolve-phase-questions',
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
      }),
    )
  })

  it('skips malformed JSON for one iteration and continues processing remaining questions', async () => {
    const q1: PhaseQuestion = {
      id: 'q-0',
      question: 'Cache needed?',
      phaseIndex: 0,
    }
    const q2: PhaseQuestion = {
      id: 'q-1',
      question: 'Which ORM?',
      phaseIndex: 0,
    }
    const state = makeState({ pendingQuestions: [q1, q2] })
    const adapters = makeAdapters(state)

    mockSend
      .mockResolvedValueOnce({
        messages: [{ role: 'assistant' as const, content: 'not valid json' }],
        usage: { inputTokens: 5, outputTokens: 5, totalCostUsd: 0 },
      })
      .mockResolvedValueOnce(
        makeSendResult({
          result: 'answered',
          answer: 'Drizzle ORM, confirmed in CLAUDE.md.',
        }),
      )

    const result = await handleResolvePhaseQuestions(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(result.pendingQuestions).toHaveLength(1)
    expect(result.pendingQuestions[0].id).toBe('q-0')
    expect(result.answeredQuestions).toHaveLength(1)
    expect(result.answeredQuestions[0].id).toBe('q-1')
  })
})
