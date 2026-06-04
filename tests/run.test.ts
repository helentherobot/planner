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
  it('returns immediately when no tasks remain', async () => {
    const state = makeState()
    const adapters = makeAdapters(state)
    const result = await run(state, adapters)
    expect(result.remainingTasks).toHaveLength(0)
    expect(adapters.store.write).not.toHaveBeenCalled()
  })

  it('skips unknown task types with a warning', async () => {
    const task: Task = { type: 'unknown-task' }
    const state = makeState({ remainingTasks: [task] })
    const adapters = makeAdapters(state)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await run(state, adapters)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unknown-task'))
    expect(result.completedTasks).toContainEqual(task)
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

    const result = await run(state, adapters, controller.signal)

    expect(result.completedTasks).toHaveLength(0)
    expect(result.remainingTasks).toHaveLength(1)
  })
})
