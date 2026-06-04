import { describe, it, expect, vi } from 'vitest'
import { handleGatherQuestions } from '../../src/tasks/gather-questions.js'
import type { PlanState, Task } from '../../src/types.js'
import type { Adapters } from '../../src/types.js'
import type { Store } from '../../src/types.js'

function makeState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    brief: 'Build something.',
    recon: 'Some recon.',
    startedAt: Date.now(),
    completedAt: null,
    currentTask: null,
    progressHandle: null,
    phases: [],
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

describe('handleGatherQuestions', () => {
  it('returns state unchanged when recipe returns no questions', async () => {
    const state = makeState()
    const store = makeStore(state)

    const runner = {
      run: vi.fn(async () => ({
        text: '{ "questions": [] }',
        usage: { inputTokens: 5, outputTokens: 10, totalCostUsd: 0.0001 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: {
        maxFilesPerPhase: 10,
        minimumIterations: 1,
        maximumIterations: 5,
      },
      controls: [],
    }

    const task: Task = { type: 'gather-questions' }
    const result = await handleGatherQuestions(task, state, adapters)

    expect(result.awaitingQuestions).toHaveLength(0)
    expect(result).toBe(state)
  })

  it('sets awaitingQuestions with correct IDs when recipe returns questions', async () => {
    const state = makeState()
    const store = makeStore(state)

    const runner = {
      run: vi.fn(async () => ({
        text: JSON.stringify({
          questions: [
            {
              question: 'Which database?',
              context: 'Affects schema phase structure.',
            },
            {
              question: 'Monorepo or separate repos?',
              context: 'Affects all phases.',
            },
          ],
        }),
        usage: { inputTokens: 20, outputTokens: 30, totalCostUsd: 0.001 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: {
        maxFilesPerPhase: 10,
        minimumIterations: 1,
        maximumIterations: 5,
      },
      controls: [],
    }

    const task: Task = { type: 'gather-questions' }
    const result = await handleGatherQuestions(task, state, adapters)

    expect(result.awaitingQuestions).toHaveLength(2)
    expect(result.awaitingQuestions[0]).toMatchObject({
      id: 'recon-0',
      question: 'Which database?',
      context: 'Affects schema phase structure.',
    })
    expect(result.awaitingQuestions[1]).toMatchObject({
      id: 'recon-1',
      question: 'Monorepo or separate repos?',
    })
    expect(result.pendingQuestions).toHaveLength(0)
  })

  it('calls onUsage with the correct taskType', async () => {
    const state = makeState()
    const store = makeStore(state)
    const onUsage = vi.fn()

    const runner = {
      run: vi.fn(async () => ({
        text: '{ "questions": [] }',
        usage: { inputTokens: 5, outputTokens: 10, totalCostUsd: 0.0001 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: {
        maxFilesPerPhase: 10,
        minimumIterations: 1,
        maximumIterations: 5,
      },
      controls: [],
      onUsage,
    }

    const task: Task = { type: 'gather-questions' }
    await handleGatherQuestions(task, state, adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'gather-questions', inputTokens: 5 }),
    )
  })

  it('returns state unchanged when recipe returns invalid JSON', async () => {
    const state = makeState()
    const store = makeStore(state)

    const runner = {
      run: vi.fn(async () => ({
        text: 'not json',
        usage: { inputTokens: 5, outputTokens: 5, totalCostUsd: 0 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: {
        maxFilesPerPhase: 10,
        minimumIterations: 1,
        maximumIterations: 5,
      },
      controls: [],
    }

    const task: Task = { type: 'gather-questions' }
    const result = await handleGatherQuestions(task, state, adapters)

    expect(result).toBe(state)
  })
})
