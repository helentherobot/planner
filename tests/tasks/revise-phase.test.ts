import { describe, it, expect, vi } from 'vitest'
import { handleRevisePhase } from '../../src/tasks/revise-phase.js'
import type { PlanState, Task, PhaseState } from '../../src/types.js'
import type { Adapters } from '../../src/types.js'
import type { Store } from '../../src/types.js'

function makePhaseState(overrides: Partial<PhaseState> = {}): PhaseState {
  return {
    title: 'Test Phase',
    brief: 'Do some things.',
    controls: {
      style: {
        dismissed: [],
        raised: [{ path: 'src/foo.ts', reason: 'Missing return type' }],
      },
    },
    iterations: 0,
    ...overrides,
  }
}

function makeState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    brief: 'brief',
    recon: '',
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

describe('handleRevisePhase', () => {
  it('includes resolved decisions section when answeredQuestions is non-empty', async () => {
    const state = makeState({
      answeredQuestions: [{ id: 'recon-0', question: 'Use REST or GraphQL?', answer: 'REST' }],
    })
    const store = makeStore(state)
    let capturedPrompt = ''

    const runner = {
      run: vi.fn(
        async (recipe: { profile: string; prompt: (ctx: unknown) => string }, args: unknown[]) => {
          capturedPrompt = recipe.prompt(args[0])
          return {
            text: 'Revised plan.',
            usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
          }
        },
      ),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [
        {
          name: 'style',
          checkRecipe: { profile: '', prompt: () => '' },
          investigateRecipe: { profile: '', prompt: () => '' },
        },
      ],
    }

    const task: Task = { type: 'revise-phase', phase: 0 }
    await handleRevisePhase(task, state, adapters)

    expect(capturedPrompt).toContain('Resolved decisions')
    expect(capturedPrompt).toContain('Use REST or GraphQL?')
    expect(capturedPrompt).toContain('REST')
  })

  it('omits resolved decisions section when answeredQuestions is empty', async () => {
    const state = makeState()
    const store = makeStore(state)
    let capturedPrompt = ''

    const runner = {
      run: vi.fn(
        async (recipe: { profile: string; prompt: (ctx: unknown) => string }, args: unknown[]) => {
          capturedPrompt = recipe.prompt(args[0])
          return {
            text: 'Revised plan.',
            usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
          }
        },
      ),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [
        {
          name: 'style',
          checkRecipe: { profile: '', prompt: () => '' },
          investigateRecipe: { profile: '', prompt: () => '' },
        },
      ],
    }

    const task: Task = { type: 'revise-phase', phase: 0 }
    await handleRevisePhase(task, state, adapters)

    expect(capturedPrompt).not.toContain('Resolved decisions')
  })

  it('returns state unchanged when no issues are raised', async () => {
    const phase = makePhaseState({ controls: {} })
    const state = makeState({ phases: [phase] })
    const store = makeStore(state)

    const runner = {
      run: vi.fn(),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
      controls: [],
    }

    const task: Task = { type: 'revise-phase', phase: 0 }
    const result = await handleRevisePhase(task, state, adapters)

    expect(result).toBe(state)
    expect(runner.run).not.toHaveBeenCalled()
  })
})
