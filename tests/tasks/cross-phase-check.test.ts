import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleCrossPhaseCheck } from '../../src/tasks/cross-phase-check.js'
import type { PlanState, Task, PhaseState } from '../../src/types.js'
import type { Adapters } from '../../src/types.js'

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
    brief: 'Do something.',
    controls: {},
    iterations: 0,
    ...overrides,
  }
}

function makeState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    brief: 'Build something.',
    recon: 'The project uses TypeScript.',
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

function makeAdapters(): Adapters {
  return {
    tools: {
      runner: {} as Adapters['tools']['runner'],
      profile: 'haiku',
      cwd: '/tmp',
      tools: [],
    },
    store: { read: vi.fn(), write: vi.fn() },
    observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
    config: { maxFilesPerPhase: 10, minIterations: 1, maxIterations: 5 },
    controls: [],
  }
}

function makeSendResult(text: string) {
  return {
    messages: [{ role: 'assistant' as const, content: text }],
    usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
  }
}

const task: Task = { type: 'cross-phase-check' }

describe('handleCrossPhaseCheck', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('no phases with index: sets crossPhaseFindings to [] without calling send', async () => {
    const state = makeState({
      phases: [makePhaseState(), makePhaseState()],
    })
    const result = await handleCrossPhaseCheck(task, state, makeAdapters())

    expect(mockSend).not.toHaveBeenCalled()
    expect(result.crossPhaseFindings).toEqual([])
    expect(result.remainingTasks).toHaveLength(0)
  })

  it('index length exceeds maxCrossPhaseIndexLength: sets crossPhaseFindings to []', async () => {
    const state = makeState({
      phases: [makePhaseState({ index: 'src/foo.ts' })],
    })
    const adapters = makeAdapters()
    adapters.config.maxCrossPhaseIndexLength = 1

    const result = await handleCrossPhaseCheck(task, state, adapters)

    expect(mockSend).not.toHaveBeenCalled()
    expect(result.crossPhaseFindings).toEqual([])
  })

  it('no contradictions: sets crossPhaseFindings to [], no revise tasks', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"findings":[]}'))
    const state = makeState({
      phases: [makePhaseState({ index: 'src/a.ts' })],
    })

    const result = await handleCrossPhaseCheck(task, state, makeAdapters())

    expect(result.crossPhaseFindings).toEqual([])
    expect(result.remainingTasks.some((t) => t.type === 'revise-phase')).toBe(
      false,
    )
    expect(
      result.remainingTasks.some((t) => t.type === 'cross-phase-check'),
    ).toBe(false)
  })

  it('contradictions found: queues revise-phase per affected phase, appends second-pass task', async () => {
    mockSend.mockResolvedValueOnce(
      makeSendResult(
        JSON.stringify({
          findings: [{ phases: [0, 1], description: 'ID type conflict' }],
        }),
      ),
    )
    const state = makeState({
      phases: [
        makePhaseState({ index: 'src/a.ts' }),
        makePhaseState({ index: 'src/b.ts' }),
      ],
    })

    const result = await handleCrossPhaseCheck(task, state, makeAdapters())

    expect(result.crossPhaseFindings).toHaveLength(1)
    const reviseTasks = result.remainingTasks.filter(
      (t) => t.type === 'revise-phase',
    )
    expect(reviseTasks).toHaveLength(2)
    expect(reviseTasks[0].phase).toBe(0)
    expect(reviseTasks[1].phase).toBe(1)
    expect(reviseTasks[0].crossPhaseFinding).toEqual({
      phases: [0, 1],
      description: 'ID type conflict',
    })

    const lastTask = result.remainingTasks[result.remainingTasks.length - 1]
    expect(lastTask.type).toBe('cross-phase-check')
    expect(lastTask.secondPass).toBe(true)
  })

  it('contradictions: preserves existing remainingTasks after second-pass task', async () => {
    mockSend.mockResolvedValueOnce(
      makeSendResult(
        JSON.stringify({
          findings: [{ phases: [0], description: 'conflict' }],
        }),
      ),
    )
    const state = makeState({
      phases: [makePhaseState({ index: 'src/a.ts' })],
      remainingTasks: [{ type: 'other' }],
    })

    const result = await handleCrossPhaseCheck(task, state, makeAdapters())

    const types = result.remainingTasks.map((t) => t.type)
    expect(types).toEqual(['revise-phase', 'cross-phase-check', 'other'])
  })

  it('second pass with findings: replaces findings, no further revise or third pass', async () => {
    mockSend.mockResolvedValueOnce(
      makeSendResult(
        JSON.stringify({
          findings: [{ phases: [0], description: 'remaining conflict' }],
        }),
      ),
    )
    const secondPassTask: Task = {
      type: 'cross-phase-check',
      secondPass: true,
    }
    const state = makeState({
      phases: [makePhaseState({ index: 'src/a.ts' })],
      crossPhaseFindings: [{ phases: [0], description: 'old conflict' }],
    })

    const result = await handleCrossPhaseCheck(
      secondPassTask,
      state,
      makeAdapters(),
    )

    expect(result.crossPhaseFindings).toEqual([
      { phases: [0], description: 'remaining conflict' },
    ])
    expect(result.remainingTasks.some((t) => t.type === 'revise-phase')).toBe(
      false,
    )
    expect(
      result.remainingTasks.some((t) => t.type === 'cross-phase-check'),
    ).toBe(false)
  })

  it('second pass with no findings: sets crossPhaseFindings to []', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"findings":[]}'))
    const secondPassTask: Task = {
      type: 'cross-phase-check',
      secondPass: true,
    }
    const state = makeState({
      phases: [makePhaseState({ index: 'src/a.ts' })],
      crossPhaseFindings: [{ phases: [0], description: 'old conflict' }],
    })

    const result = await handleCrossPhaseCheck(
      secondPassTask,
      state,
      makeAdapters(),
    )

    expect(result.crossPhaseFindings).toEqual([])
    expect(result.remainingTasks).toHaveLength(0)
  })

  it('schema validation retry: invalid JSON retries and succeeds', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult('not json'))
      .mockResolvedValueOnce(makeSendResult('{"findings":[]}'))

    const state = makeState({
      phases: [makePhaseState({ index: 'src/a.ts' })],
    })

    const result = await handleCrossPhaseCheck(task, state, makeAdapters())

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(result.crossPhaseFindings).toEqual([])
  })

  it('calls onUsage with cross-phase-check taskType', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"findings":[]}'))
    const onUsage = vi.fn()
    const adapters = { ...makeAdapters(), onUsage }
    const state = makeState({
      phases: [makePhaseState({ index: 'src/a.ts' })],
    })

    await handleCrossPhaseCheck(task, state, adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'cross-phase-check' }),
    )
  })
})
