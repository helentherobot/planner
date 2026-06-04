import { describe, it, expect, vi } from 'vitest'
import { handleCollectFeedback } from '../../src/tasks/collect-feedback.js'
import type { PlanState, Task, PhaseState } from '../../src/types.js'
import type { Adapters } from '../../src/types.js'
import type { QualityControl } from '../../src/types.js'
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

function makeAdapters(state: PlanState, controls: QualityControl[] = []): Adapters {
  return {
    tools: {
      runner: {} as Adapters['tools']['runner'],
      profile: 'haiku',
      cwd: '/tmp',
      tools: [],
    },
    store: makeStore(state),
    observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
    controls,
    config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
  }
}

const task: Task = { type: 'collect-feedback', phase: 0 }

describe('handleCollectFeedback', () => {
  it('clears phase pipeline tasks when all clean and iterations >= minimumIterations', async () => {
    const phase = makePhaseState({ iterations: 1 })
    const state = makeState([phase])
    const adapters = makeAdapters(state)

    const result = await handleCollectFeedback(task, state, adapters)

    expect(result.remainingTasks).toHaveLength(0)
  })

  it('queues check-phase again when all clean but below minimumIterations', async () => {
    const phase = makePhaseState({ iterations: 0 })
    const state = makeState([phase])
    const adapters = makeAdapters(state)
    adapters.config.minimumIterations = 2

    const result = await handleCollectFeedback(task, state, adapters)

    expect(result.remainingTasks[0]?.type).toBe('check-phase')
  })

  it('queues revise-phase then check-phase when issues are raised', async () => {
    const phase = makePhaseState({
      iterations: 1,
      controls: {
        vagueness: { dismissed: [], raised: ['Something is vague'] },
      },
    })
    const state = makeState([phase])

    const control: QualityControl = {
      name: 'vagueness',
      checkRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
      investigateRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
    }

    const adapters = makeAdapters(state, [control])

    const result = await handleCollectFeedback(task, state, adapters)

    expect(result.remainingTasks[0]?.type).toBe('revise-phase')
    expect(result.remainingTasks[1]?.type).toBe('check-phase')
  })
})
