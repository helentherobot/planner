import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleCheckSynthesis } from '../../src/tasks/check-synthesis.js'
import type { PlanState, Task } from '../../src/types.js'
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

function makeState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    brief: 'Build something.',
    recon: 'The project uses TypeScript.',
    startedAt: Date.now(),
    completedAt: null,
    currentTask: null,
    progressHandle: null,
    phases: [
      { title: 'Phase One', brief: '', controls: {}, iterations: 0 },
      { title: 'Phase Two', brief: '', controls: {}, iterations: 0 },
    ],
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
    config: {
      maxFilesPerPhase: 10,
      minIterations: 1,
      maxIterations: 5,
    },
    controls: [],
  }
}

function makeSendResult(text: string) {
  return {
    messages: [{ role: 'assistant' as const, content: text }],
    usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
  }
}

const task: Task = { type: 'check-synthesis' }

describe('handleCheckSynthesis', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('pass path: calls expandPhases and returns per-phase tasks', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"pass":true,"gap":null}'))
    const state = makeState({
      synthesisAmendment: 'order wrong',
      synthesisRetries: 1,
    })
    const adapters = makeAdapters()

    const result = await handleCheckSynthesis(task, state, adapters)

    expect(result.synthesisAmendment).toBeNull()
    expect(result.synthesisRetries).toBe(0)
    expect(result.remainingTasks.some((t) => t.type === 'cleanup')).toBe(true)
    expect(
      result.remainingTasks.some(
        (t) => t.type === 'plan-phase' && t.phase === 0,
      ),
    ).toBe(true)
  })

  it('pass path: does not prepend synthesize-phases', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"pass":true,"gap":null}'))
    const adapters = makeAdapters()

    const result = await handleCheckSynthesis(task, makeState(), adapters)

    expect(
      result.remainingTasks.some((t) => t.type === 'synthesize-phases'),
    ).toBe(false)
  })

  it('fail path: sets synthesisAmendment and prepends synthesize-phases', async () => {
    mockSend.mockResolvedValueOnce(
      makeSendResult('{"pass":false,"gap":"coverage gap"}'),
    )
    const state = makeState()
    const adapters = makeAdapters()

    const result = await handleCheckSynthesis(task, state, adapters)

    expect(result.synthesisAmendment).toBe('coverage gap')
    expect(result.synthesisRetries).toBe(1)
    expect(result.remainingTasks[0].type).toBe('synthesize-phases')
  })

  it('fail path: preserves existing remainingTasks after prepend', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"pass":false,"gap":"gap"}'))
    const state = makeState({
      remainingTasks: [{ type: 'cleanup' }],
    })
    const adapters = makeAdapters()

    const result = await handleCheckSynthesis(task, state, adapters)

    expect(result.remainingTasks[0].type).toBe('synthesize-phases')
    expect(result.remainingTasks[1].type).toBe('cleanup')
  })

  it('exhausted retries: throws synthesis-incomplete', async () => {
    mockSend.mockResolvedValueOnce(
      makeSendResult('{"pass":false,"gap":"still broken"}'),
    )
    const state = makeState({ synthesisRetries: 2 })
    const adapters = makeAdapters()

    await expect(handleCheckSynthesis(task, state, adapters)).rejects.toThrow(
      'synthesis-incomplete',
    )
  })

  it('schema validation retry: invalid JSON retries and resolves', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult('not json'))
      .mockResolvedValueOnce(makeSendResult('{"pass":true,"gap":null}'))

    const adapters = makeAdapters()

    const result = await handleCheckSynthesis(task, makeState(), adapters)

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(result.synthesisAmendment).toBeNull()
  })

  it('user message includes brief, recon, and phase titles', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"pass":true,"gap":null}'))
    const adapters = makeAdapters()

    await handleCheckSynthesis(task, makeState(), adapters)

    const [, , messages] = mockSend.mock.calls[0]
    const userMessage = messages[0] as string
    expect(userMessage).toContain('Build something.')
    expect(userMessage).toContain('The project uses TypeScript.')
    expect(userMessage).toContain('Phase One')
    expect(userMessage).toContain('Phase Two')
  })

  it('calls onUsage with check-synthesis taskType', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"pass":true,"gap":null}'))
    const onUsage = vi.fn()
    const adapters = { ...makeAdapters(), onUsage }

    await handleCheckSynthesis(task, makeState(), adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'check-synthesis' }),
    )
  })
})
