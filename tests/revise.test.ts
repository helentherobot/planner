import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  PlanState,
  PhaseQuestion,
  PhaseState,
  Adapters,
  Store,
} from '../src/types.js'

vi.mock('../src/run.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/run.js')>()
  return {
    ...actual,
    drainTasks: vi.fn(async (state: PlanState) => ({
      status: 'complete' as const,
      state,
    })),
  }
})

import { revise } from '../src/revise.js'
import { drainTasks } from '../src/run.js'
import { phaseTaskOrder } from '../src/helpers.js'

function makePhaseState(title: string): PhaseState {
  return {
    title,
    brief: `Brief for ${title}`,
    controls: {},
    iterations: 0,
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
    phases: [
      makePhaseState('Phase A'),
      makePhaseState('Phase B'),
      makePhaseState('Phase C'),
    ],
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
      minimumIterations: 1,
      maximumIterations: 5,
    },
    controls: [],
  }
}

const defaultUsage = { inputTokens: 15, outputTokens: 25, totalCostUsd: 0.001 }

const pendingQuestion: PhaseQuestion = {
  id: '1-0',
  question: 'Should we use Redis for caching?',
  context: 'Affects the caching phase.',
  phaseIndex: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('revise', () => {
  it('calls the phase-spread recipe with correct context', async () => {
    const state = makeState({ pendingQuestions: [pendingQuestion] })
    const adapters = makeAdapters(state, {
      text: '{ "additionalPhases": [] }',
      usage: defaultUsage,
    })

    await revise(state, adapters, pendingQuestion, 'Yes, use Redis.')

    expect(adapters.tools.runner.run).toHaveBeenCalledOnce()
    const callArg = (adapters.tools.runner.run as ReturnType<typeof vi.fn>).mock
      .calls[0][1][0]
    expect(callArg.question).toMatchObject({
      id: '1-0',
      question: 'Should we use Redis for caching?',
    })
    expect(callArg.answer).toBe('Yes, use Redis.')
    expect(callArg.directPhaseIndex).toBe(1)
    expect(callArg.phaseTitles).toEqual([
      { index: 0, title: 'Phase A' },
      { index: 1, title: 'Phase B' },
      { index: 2, title: 'Phase C' },
    ])
  })

  it('prepends tasks for the direct phase when additionalPhases is empty', async () => {
    const state = makeState({ pendingQuestions: [pendingQuestion] })
    const adapters = makeAdapters(state, {
      text: '{ "additionalPhases": [] }',
      usage: defaultUsage,
    })

    await revise(state, adapters, pendingQuestion, 'Yes, use Redis.')

    const drainMock = drainTasks as ReturnType<typeof vi.fn>
    const calledState: PlanState = drainMock.mock.calls[0][0]

    const expectedTasks = phaseTaskOrder.map((type) => ({ type, phase: 1 }))
    expect(calledState.remainingTasks).toEqual(expectedTasks)
  })

  it('merges additionalPhases with directPhaseIndex and prepends tasks for all affected phases', async () => {
    const state = makeState({ pendingQuestions: [pendingQuestion] })
    const adapters = makeAdapters(state, {
      text: '{ "additionalPhases": [2] }',
      usage: defaultUsage,
    })

    await revise(state, adapters, pendingQuestion, 'Yes, use Redis.')

    const drainMock = drainTasks as ReturnType<typeof vi.fn>
    const calledState: PlanState = drainMock.mock.calls[0][0]

    const tasksForPhase1 = phaseTaskOrder.map((type) => ({ type, phase: 1 }))
    const tasksForPhase2 = phaseTaskOrder.map((type) => ({ type, phase: 2 }))
    expect(calledState.remainingTasks).toEqual([
      ...tasksForPhase1,
      ...tasksForPhase2,
    ])
  })

  it('handles phaseIndex as an array', async () => {
    const multiPhaseQuestion: PhaseQuestion = {
      ...pendingQuestion,
      phaseIndex: [0, 1],
    }
    const state = makeState({ pendingQuestions: [multiPhaseQuestion] })
    const adapters = makeAdapters(state, {
      text: '{ "additionalPhases": [] }',
      usage: defaultUsage,
    })

    await revise(state, adapters, multiPhaseQuestion, 'Some answer.')

    const drainMock = drainTasks as ReturnType<typeof vi.fn>
    const calledState: PlanState = drainMock.mock.calls[0][0]

    const tasksForPhase0 = phaseTaskOrder.map((type) => ({ type, phase: 0 }))
    const tasksForPhase1 = phaseTaskOrder.map((type) => ({ type, phase: 1 }))
    expect(calledState.remainingTasks).toEqual([
      ...tasksForPhase0,
      ...tasksForPhase1,
    ])
  })

  it('moves the question from pendingQuestions to answeredQuestions', async () => {
    const state = makeState({ pendingQuestions: [pendingQuestion] })
    const adapters = makeAdapters(state, {
      text: '{ "additionalPhases": [] }',
      usage: defaultUsage,
    })

    await revise(state, adapters, pendingQuestion, 'Yes, use Redis.')

    const drainMock = drainTasks as ReturnType<typeof vi.fn>
    const calledState: PlanState = drainMock.mock.calls[0][0]

    expect(calledState.pendingQuestions).toHaveLength(0)
    expect(calledState.answeredQuestions).toHaveLength(1)
    expect(calledState.answeredQuestions[0]).toMatchObject({
      id: '1-0',
      question: 'Should we use Redis for caching?',
      answer: 'Yes, use Redis.',
    })
  })

  it('calls store.write before the task loop', async () => {
    const state = makeState({ pendingQuestions: [pendingQuestion] })
    const adapters = makeAdapters(state, {
      text: '{ "additionalPhases": [] }',
      usage: defaultUsage,
    })

    await revise(state, adapters, pendingQuestion, 'Yes, use Redis.')

    expect(adapters.store.write).toHaveBeenCalled()

    const drainMock = drainTasks as ReturnType<typeof vi.fn>
    const writeCallOrder = (adapters.store.write as ReturnType<typeof vi.fn>)
      .mock.invocationCallOrder[0]
    const drainCallOrder = drainMock.mock.invocationCallOrder[0]
    expect(writeCallOrder).toBeLessThan(drainCallOrder)
  })

  it('does not double-queue phases already in remainingTasks', async () => {
    const alreadyQueued = phaseTaskOrder.map((type) => ({ type, phase: 1 }))
    const state = makeState({
      pendingQuestions: [pendingQuestion],
      remainingTasks: alreadyQueued,
    })
    const adapters = makeAdapters(state, {
      text: '{ "additionalPhases": [] }',
      usage: defaultUsage,
    })

    await revise(state, adapters, pendingQuestion, 'Yes, use Redis.')

    const drainMock = drainTasks as ReturnType<typeof vi.fn>
    const calledState: PlanState = drainMock.mock.calls[0][0]

    const phase1Tasks = calledState.remainingTasks.filter((t) => t.phase === 1)
    expect(phase1Tasks).toHaveLength(alreadyQueued.length)
  })

  it('returns the final state from the task loop', async () => {
    const state = makeState({ pendingQuestions: [pendingQuestion] })
    const finalState = makeState({ brief: 'Updated brief' })
    const drainMock = drainTasks as ReturnType<typeof vi.fn>
    drainMock.mockResolvedValueOnce({ status: 'complete', state: finalState })

    const adapters = makeAdapters(state, {
      text: '{ "additionalPhases": [] }',
      usage: defaultUsage,
    })

    const result = await revise(
      state,
      adapters,
      pendingQuestion,
      'Yes, use Redis.',
    )

    expect(result).toBe(finalState)
  })

  it('calls onUsage with the phase-spread recipe usage', async () => {
    const state = makeState({ pendingQuestions: [pendingQuestion] })
    const onUsage = vi.fn()
    const adapters = makeAdapters(state, {
      text: '{ "additionalPhases": [] }',
      usage: defaultUsage,
    })
    adapters.onUsage = onUsage

    await revise(state, adapters, pendingQuestion, 'Yes, use Redis.')

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'revise-spread', inputTokens: 15 }),
    )
  })

  it('throws when drainTasks unexpectedly returns needs-answers', async () => {
    const state = makeState({ pendingQuestions: [pendingQuestion] })
    const drainMock = drainTasks as ReturnType<typeof vi.fn>
    drainMock.mockResolvedValueOnce({
      status: 'needs-answers',
      questions: [{ id: 'recon-0', question: 'Unexpected?' }],
      state,
    })

    const adapters = makeAdapters(state, {
      text: '{ "additionalPhases": [] }',
      usage: defaultUsage,
    })

    await expect(
      revise(state, adapters, pendingQuestion, 'Yes.'),
    ).rejects.toThrow('unexpected needs-answers')
  })

  it('deduplicates phases when additionalPhases overlaps with directPhaseIndex', async () => {
    const state = makeState({ pendingQuestions: [pendingQuestion] })
    const adapters = makeAdapters(state, {
      text: '{ "additionalPhases": [1, 2] }',
      usage: defaultUsage,
    })

    await revise(state, adapters, pendingQuestion, 'Yes, use Redis.')

    const drainMock = drainTasks as ReturnType<typeof vi.fn>
    const calledState: PlanState = drainMock.mock.calls[0][0]

    const phase1Tasks = calledState.remainingTasks.filter((t) => t.phase === 1)
    expect(phase1Tasks).toHaveLength(phaseTaskOrder.length)
  })
})
