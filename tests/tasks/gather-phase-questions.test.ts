import { describe, it, expect, vi } from 'vitest'
import { handleGatherPhaseQuestions } from '../../src/tasks/gather-phase-questions.js'
import type {
  PlanState,
  Task,
  PhaseState,
  PhaseQuestion,
} from '../../src/types.js'
import type { Adapters } from '../../src/types.js'
import type { Store } from '../../src/types.js'

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

function makeAdapters(state: PlanState, runnerResult: object): Adapters {
  const runner = {
    run: vi.fn(async () => runnerResult),
  } as unknown as Adapters['tools']['runner']

  return {
    tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
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

const defaultUsage = { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 }

describe('handleGatherPhaseQuestions', () => {
  it('returns state unchanged when recipe returns no questions', async () => {
    const state = makeState()
    const adapters = makeAdapters(state, {
      text: '{ "questions": [] }',
      usage: defaultUsage,
    })

    const task: Task = { type: 'gather-phase-questions', phase: 0 }
    const result = await handleGatherPhaseQuestions(task, state, adapters)

    expect(result).toBe(state)
    expect(result.pendingQuestions).toHaveLength(0)
  })

  it('appends questions with correct phaseIndex and IDs', async () => {
    const state = makeState()
    const adapters = makeAdapters(state, {
      text: JSON.stringify({
        questions: [
          {
            question: 'Which auth strategy?',
            context: 'Affects implementation approach.',
          },
          { question: 'Cache needed?', context: 'Changes phase complexity.' },
        ],
      }),
      usage: defaultUsage,
    })

    const task: Task = { type: 'gather-phase-questions', phase: 0 }
    const result = await handleGatherPhaseQuestions(task, state, adapters)

    expect(result.pendingQuestions).toHaveLength(2)
    expect(result.pendingQuestions[0]).toMatchObject({
      id: '0-0',
      question: 'Which auth strategy?',
      context: 'Affects implementation approach.',
      phaseIndex: 0,
    })
    expect(result.pendingQuestions[1]).toMatchObject({
      id: '0-1',
      question: 'Cache needed?',
      phaseIndex: 0,
    })
  })

  it('merges phaseIndex when question is an exact duplicate (same casing)', async () => {
    const existing: PhaseQuestion = {
      id: '1-0',
      question: 'Which auth strategy?',
      context: 'Already pending.',
      phaseIndex: 1,
    }
    const state = makeState({ pendingQuestions: [existing] })
    const adapters = makeAdapters(state, {
      text: JSON.stringify({
        questions: [
          { question: 'Which auth strategy?', context: 'Affects approach.' },
        ],
      }),
      usage: defaultUsage,
    })

    const task: Task = { type: 'gather-phase-questions', phase: 0 }
    const result = await handleGatherPhaseQuestions(task, state, adapters)

    expect(result.pendingQuestions).toHaveLength(1)
    expect(result.pendingQuestions[0].phaseIndex).toEqual([1, 0])
  })

  it('merges phaseIndex when question differs only in casing and whitespace', async () => {
    const existing: PhaseQuestion = {
      id: '1-0',
      question: 'which auth strategy?',
      phaseIndex: 1,
    }
    const state = makeState({ pendingQuestions: [existing] })
    const adapters = makeAdapters(state, {
      text: JSON.stringify({
        questions: [{ question: '  Which Auth Strategy?  ' }],
      }),
      usage: defaultUsage,
    })

    const task: Task = { type: 'gather-phase-questions', phase: 0 }
    const result = await handleGatherPhaseQuestions(task, state, adapters)

    expect(result.pendingQuestions).toHaveLength(1)
    expect(result.pendingQuestions[0].phaseIndex).toEqual([1, 0])
  })

  it('does not duplicate phaseIndex when merging the same phase twice', async () => {
    const existing: PhaseQuestion = {
      id: '0-0',
      question: 'Which auth strategy?',
      phaseIndex: [0, 1],
    }
    const state = makeState({ pendingQuestions: [existing] })
    const adapters = makeAdapters(state, {
      text: JSON.stringify({
        questions: [{ question: 'Which auth strategy?' }],
      }),
      usage: defaultUsage,
    })

    const task: Task = { type: 'gather-phase-questions', phase: 0 }
    const result = await handleGatherPhaseQuestions(task, state, adapters)

    expect(result.pendingQuestions).toHaveLength(1)
    expect(result.pendingQuestions[0].phaseIndex).toEqual([0, 1])
  })

  it('calls onUsage with the correct taskType', async () => {
    const state = makeState()
    const onUsage = vi.fn()
    const runner = {
      run: vi.fn(async () => ({
        text: '{ "questions": [] }',
        usage: defaultUsage,
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store: makeStore(state),
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
      },
      controls: [],
      onUsage,
    }

    const task: Task = { type: 'gather-phase-questions', phase: 0 }
    await handleGatherPhaseQuestions(task, state, adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'gather-phase-questions',
        inputTokens: 10,
      }),
    )
  })

  it('returns state unchanged when recipe returns invalid JSON', async () => {
    const state = makeState()
    const adapters = makeAdapters(state, {
      text: 'not json',
      usage: defaultUsage,
    })

    const task: Task = { type: 'gather-phase-questions', phase: 0 }
    const result = await handleGatherPhaseQuestions(task, state, adapters)

    expect(result).toBe(state)
  })
})
