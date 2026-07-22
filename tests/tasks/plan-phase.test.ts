import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handlePlanPhase } from '../../src/tasks/plan-phase.js'
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

function makeSendResult(text = '') {
  return {
    messages: text ? [{ role: 'assistant' as const, content: text }] : [],
    usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
  }
}

describe('handlePlanPhase', () => {
  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue(makeSendResult('a'.repeat(900)))
  })

  it('sends phaseState.brief when no other phases have a non-empty index', async () => {
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

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).toBe('Do some things.')
  })

  it('sends phaseState.prompt (over brief) when no cross-phase context', async () => {
    const phase = makePhaseState({ prompt: 'Custom prompt.' })
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

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).toBe('Custom prompt.')
  })

  it('excludes another phase when its index is empty', async () => {
    const phase0 = makePhaseState({ title: 'Phase One', index: '' })
    const phase1 = makePhaseState({
      title: 'Phase Two',
      brief: 'Do other things.',
    })
    const state = makeState([phase0, phase1])
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

    await handlePlanPhase({ type: 'plan-phase', phase: 1 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).toBe('Do other things.')
    expect(messages[0]).not.toContain('Other phases already planned')
  })

  it('prepends cross-phase block when another phase has a non-empty index', async () => {
    const phase0 = makePhaseState({
      title: 'Setup',
      index: 'src/setup.ts\nsrc/config.ts',
    })
    const phase1 = makePhaseState({
      title: 'Feature',
      brief: 'Build the feature.',
    })
    const state = makeState([phase0, phase1])
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

    await handlePlanPhase({ type: 'plan-phase', phase: 1 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).toContain('Other phases already planned')
    expect(messages[0]).toContain('Phase 1 — Setup')
    expect(messages[0]).toContain('src/setup.ts')
    expect(messages[0]).toContain('src/config.ts')
    expect(messages[0]).toContain('Build the feature.')
  })

  it('calls onUsage after send resolves', async () => {
    const phase = makePhaseState()
    const state = makeState([phase])
    const store = makeStore(state)
    const onUsage = vi.fn()

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
      onUsage,
    }

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'plan-phase', inputTokens: 10 }),
    )
  })

  it('does not include the current phase in the cross-phase block', async () => {
    const phase0 = makePhaseState({
      title: 'Current',
      index: 'src/current.ts',
      brief: 'Current work.',
    })
    const phase1 = makePhaseState({ title: 'Other', index: 'src/other.ts' })
    const state = makeState([phase0, phase1])
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

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).not.toContain('src/current.ts')
    expect(messages[0]).toContain('src/other.ts')
  })

  it('prepends answered questions block when answeredQuestions is non-empty', async () => {
    const phase = makePhaseState({ brief: 'Do some things.' })
    const state = {
      ...makeState([phase]),
      answeredQuestions: [
        { id: 'recon-0', question: 'Use REST or GraphQL?', answer: 'REST' },
      ],
    }
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

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).toContain('Resolved decisions')
    expect(messages[0]).toContain('Use REST or GraphQL?')
    expect(messages[0]).toContain('REST')
    expect(messages[0]).toContain('Do some things.')
  })

  it('omits answered questions block when answeredQuestions is empty', async () => {
    const phase = makePhaseState({ brief: 'Do some things.' })
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

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).not.toContain('Resolved decisions')
  })

  it('schemaArtifact set, phase > 0: injects schema into user message', async () => {
    const SCHEMA = JSON.stringify({
      tables: [{ name: 'users', columns: [], primaryKeyStyle: 'integer' }],
    })
    const phase0 = makePhaseState({ title: 'Phase 0', index: '' })
    const phase1 = makePhaseState({ title: 'Phase 1', brief: 'Build the API.' })
    const state = {
      ...makeState([phase0, phase1]),
      schemaArtifact: SCHEMA,
    }
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

    await handlePlanPhase({ type: 'plan-phase', phase: 1 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).toContain('Locked schema from Phase 0:')
    expect(messages[0]).toContain(SCHEMA)
  })

  it('schemaArtifact null: no schema injected', async () => {
    const phase = makePhaseState({ brief: 'Build the API.' })
    const state = {
      ...makeState([makePhaseState(), phase]),
      schemaArtifact: null,
    }
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

    await handlePlanPhase({ type: 'plan-phase', phase: 1 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).not.toContain('Locked schema from Phase 0:')
  })

  it('phase 0: no schema injection even when schemaArtifact is set', async () => {
    const SCHEMA = JSON.stringify({
      tables: [{ name: 'users', columns: [], primaryKeyStyle: 'integer' }],
    })
    const phase = makePhaseState({ brief: 'Define the schema.' })
    const state = {
      ...makeState([phase]),
      schemaArtifact: SCHEMA,
    }
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

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).not.toContain('Locked schema from Phase 0:')
  })

  it('retry path: first call returns short output, second returns valid', async () => {
    const LONG_PLAN = 'a'.repeat(900)
    mockSend.reset ? mockSend.mockReset() : undefined
    mockSend
      .mockResolvedValueOnce(makeSendResult('short'))
      .mockResolvedValueOnce(makeSendResult(LONG_PLAN))

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

    await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(2)
    const storedPhase = store.read()!.phases[0]
    expect(storedPhase.brief).toBe(LONG_PLAN)
  })

  it('exhausted retries: all calls return invalid output, throws', async () => {
    mockSend.mockReset()
    mockSend.mockResolvedValue(makeSendResult('short'))

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
      handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters),
    ).rejects.toThrow('plan-phase-validation-failed')
    expect(mockSend).toHaveBeenCalledTimes(3)
  })
})
