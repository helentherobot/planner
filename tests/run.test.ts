import { describe, it, expect, vi } from 'vitest'
import { run } from '../src/run.js'
import type { PlanState, Task } from '../src/types.js'
import type { Adapters } from '../src/types.js'
import type { Store } from '../src/types.js'
import type { Observer } from '../src/types.js'

function makeState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    brief: 'test brief',
    recon: '',
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

function makeAdapters(storeState: PlanState): Adapters {
  let stored = storeState

  const store: Store = {
    read: vi.fn(() => stored),
    write: vi.fn((s) => {
      stored = s
    }),
  }

  const observer: Observer = {
    start: vi.fn(async () => null),
    update: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
  }

  return {
    tools: {
      runner: {} as Adapters['tools']['runner'],
      profile: 'haiku',
      cwd: '/tmp',
      tools: [],
    },
    store,
    observer,
    config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
    controls: [],
  }
}

describe('run', () => {
  it('returns { status: complete } when no tasks remain', async () => {
    const state = makeState()
    const adapters = makeAdapters(state)
    const result = await run(state, adapters)
    expect(result.status).toBe('complete')
    expect(result.state.remainingTasks).toHaveLength(0)
    expect(adapters.store.write).not.toHaveBeenCalled()
  })

  it('skips unknown task types with a warning', async () => {
    const task: Task = { type: 'unknown-task' }
    const state = makeState({ remainingTasks: [task] })
    const adapters = makeAdapters(state)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await run(state, adapters)

    expect(result.status).toBe('complete')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown-task'))
    expect(result.state.completedTasks).toContainEqual(task)
    warnSpy.mockRestore()
  })

  it('persists state after each task', async () => {
    const task: Task = { type: 'cleanup' }
    const state = makeState({ remainingTasks: [task] })
    const adapters = makeAdapters(state)

    await run(state, adapters)

    expect(adapters.store.write).toHaveBeenCalled()
  })

  it('reports progress via observer after each task', async () => {
    const task: Task = { type: 'cleanup' }
    const state = makeState({ remainingTasks: [task] })
    const adapters = makeAdapters(state)

    await run(state, adapters)

    expect(adapters.observer.update).toHaveBeenCalled()
  })

  it('stops early when signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    const task: Task = { type: 'cleanup' }
    const state = makeState({ remainingTasks: [task] })
    const adapters = makeAdapters(state)

    const result = await run(state, adapters, { signal: controller.signal })

    expect(result.status).toBe('complete')
    expect(result.state.completedTasks).toHaveLength(0)
    expect(result.state.remainingTasks).toHaveLength(1)
  })

  it('accepts AbortSignal directly for backwards compatibility', async () => {
    const controller = new AbortController()
    controller.abort()

    const task: Task = { type: 'cleanup' }
    const state = makeState({ remainingTasks: [task] })
    const adapters = makeAdapters(state)

    const result = await run(state, adapters, controller.signal)

    expect(result.status).toBe('complete')
    expect(result.state.completedTasks).toHaveLength(0)
  })

  it('returns needs-answers when a task sets awaitingQuestions', async () => {
    const awaitingQuestions = [
      { id: 'recon-0', question: 'Which database?', context: 'Affects phase structure.' },
    ]

    const mockGatherQuestionsHandler = vi.fn(async (_task: Task, state: PlanState) => ({
      ...state,
      awaitingQuestions,
    }))

    const task: Task = { type: 'gather-questions' }
    const state = makeState({ remainingTasks: [task] })
    const adapters = makeAdapters(state)

    vi.doMock('../src/tasks/gather-questions.js', () => ({
      handleGatherQuestions: mockGatherQuestionsHandler,
    }))

    const runner = {
      run: vi.fn(async () => ({
        text: JSON.stringify({
          questions: [{ question: 'Which database?', context: 'Affects phase structure.' }],
        }),
        usage: { inputTokens: 10, outputTokens: 10, totalCostUsd: 0 },
      })),
    } as unknown as Adapters['tools']['runner']
    adapters.tools.runner = runner

    const { run: freshRun } = await import('../src/run.js')
    const result = await freshRun(state, adapters)

    if (result.status === 'needs-answers') {
      expect(result.questions).toHaveLength(1)
      expect(result.questions[0].id).toBe('recon-0')
      expect(adapters.observer.complete).not.toHaveBeenCalled()
    } else {
      expect(result.state.awaitingQuestions).toHaveLength(0)
    }
  })

  it('merges answers into answeredQuestions and clears awaitingQuestions on resume', async () => {
    const awaitingQuestion = {
      id: 'recon-0',
      question: 'Which database?',
      context: 'Affects phase structure.',
    }
    const state = makeState({ awaitingQuestions: [awaitingQuestion] })
    const adapters = makeAdapters(state)

    const result = await run(state, adapters, {
      answers: [{ questionId: 'recon-0', answer: 'PostgreSQL' }],
    })

    expect(result.status).toBe('complete')
    expect(result.state.answeredQuestions).toHaveLength(1)
    expect(result.state.answeredQuestions[0]).toMatchObject({
      id: 'recon-0',
      question: 'Which database?',
      answer: 'PostgreSQL',
    })
    expect(result.state.awaitingQuestions).toHaveLength(0)
  })

  it('does not call observer.complete on needs-answers path', async () => {
    const awaitingQuestion = { id: 'recon-0', question: 'A question?' }

    const gatherQuestionsTask: Task = { type: 'gather-questions' }
    const state = makeState({ remainingTasks: [gatherQuestionsTask] })
    const adapters = makeAdapters(state)

    const runner = {
      run: vi.fn(async () => ({
        text: JSON.stringify({
          questions: [{ question: 'A question?', context: 'Some context.' }],
        }),
        usage: { inputTokens: 10, outputTokens: 10, totalCostUsd: 0 },
      })),
    } as unknown as Adapters['tools']['runner']
    adapters.tools.runner = runner

    const result = await run(state, adapters)

    if (result.status === 'needs-answers') {
      expect(adapters.observer.complete).not.toHaveBeenCalled()
      expect(result.questions.length).toBeGreaterThan(0)
    }
  })
})
