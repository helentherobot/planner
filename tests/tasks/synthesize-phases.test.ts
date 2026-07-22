import { describe, it, expect, vi } from 'vitest'
import { handleSynthesizePhases } from '../../src/tasks/synthesize-phases.js'
import type { PlanState, Task } from '../../src/types.js'
import type { Adapters } from '../../src/types.js'
import type { Store } from '../../src/types.js'

function makeState(): PlanState {
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

describe('handleSynthesizePhases', () => {
  it('calls onUsage with the correct taskType after the recipe runs', async () => {
    const state = makeState()
    const store = makeStore(state)
    const onUsage = vi.fn()

    const runner = {
      run: vi.fn(async () => ({
        text: '1. Phase One\n2. Phase Two',
        usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
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

    const task: Task = { type: 'synthesize-phases' }
    await handleSynthesizePhases(task, state, adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'synthesize-phases',
        inputTokens: 10,
      }),
    )
  })

  it('does not error when onUsage is not provided', async () => {
    const state = makeState()
    const store = makeStore(state)

    const runner = {
      run: vi.fn(async () => ({
        text: '1. Phase One',
        usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
      })),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
      },
      controls: [],
    }

    const task: Task = { type: 'synthesize-phases' }
    await expect(
      handleSynthesizePhases(task, state, adapters),
    ).resolves.not.toThrow()
  })

  it('includes resolved decisions section when answeredQuestions is non-empty', async () => {
    const state = {
      ...makeState(),
      answeredQuestions: [
        { id: 'recon-0', question: 'Use REST or GraphQL?', answer: 'REST' },
      ],
    }
    const store = makeStore(state)
    let capturedPrompt = ''

    const runner = {
      run: vi.fn(
        async (
          recipe: { profile: string; prompt: (ctx: unknown) => string },
          args: unknown[],
        ) => {
          capturedPrompt = recipe.prompt(args[0])
          return {
            text: '1. Phase One',
            usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
          }
        },
      ),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
      },
      controls: [],
    }

    await handleSynthesizePhases({ type: 'synthesize-phases' }, state, adapters)

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
        async (
          recipe: { profile: string; prompt: (ctx: unknown) => string },
          args: unknown[],
        ) => {
          capturedPrompt = recipe.prompt(args[0])
          return {
            text: '1. Phase One',
            usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
          }
        },
      ),
    } as unknown as Adapters['tools']['runner']

    const adapters: Adapters = {
      tools: { runner, profile: 'haiku', cwd: '/tmp', tools: [] },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
      },
      controls: [],
    }

    await handleSynthesizePhases({ type: 'synthesize-phases' }, state, adapters)

    expect(capturedPrompt).not.toContain('Resolved decisions')
  })
})
