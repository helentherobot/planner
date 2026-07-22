import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleGatherRecon } from '../../src/tasks/gather-recon.js'
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
    brief: 'Build something great.',
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

const LONG_TEXT = 'a'.repeat(600)

const task: Task = { type: 'gather-recon' }

describe('handleGatherRecon', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('normal path: valid output on first call sets recon and does not retry', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult(LONG_TEXT))

    const state = makeState()
    const adapters = makeAdapters()

    const result = await handleGatherRecon(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(result.recon).toBe(LONG_TEXT)
  })

  it('retry path: first call returns short output, second returns valid', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult('too short'))
      .mockResolvedValueOnce(makeSendResult(LONG_TEXT))

    const state = makeState()
    const adapters = makeAdapters()

    const result = await handleGatherRecon(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(result.recon).toBe(LONG_TEXT)
  })

  it('retry path: second send receives original messages plus retry prompt', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult('too short'))
      .mockResolvedValueOnce(makeSendResult(LONG_TEXT))

    const state = makeState()
    const adapters = makeAdapters()

    await handleGatherRecon(task, state, adapters)

    const retryMessages = mockSend.mock.calls[1][2]
    expect(
      retryMessages.some((m: unknown) => {
        if (typeof m === 'string') return false
        const msg = m as { role: string; content: string }
        return msg.role === 'user' && msg.content.includes('characters')
      }),
    ).toBe(true)
  })

  it('exhausted retries: all calls return invalid output, throws', async () => {
    mockSend.mockResolvedValue(makeSendResult('short'))

    const state = makeState()
    const adapters = makeAdapters()

    await expect(handleGatherRecon(task, state, adapters)).rejects.toThrow(
      'gather-recon-validation-failed',
    )
    expect(mockSend).toHaveBeenCalledTimes(3)
  })

  it('calls onUsage after each send including retries', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult('short'))
      .mockResolvedValueOnce(makeSendResult(LONG_TEXT))

    const state = makeState()
    const onUsage = vi.fn()
    const adapters = { ...makeAdapters(), onUsage }

    await handleGatherRecon(task, state, adapters)

    expect(onUsage).toHaveBeenCalledTimes(2)
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'gather-recon' }),
    )
  })

  it('custom taskValidation overrides default validation threshold', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('enough'))

    const state = makeState()
    const adapters: Adapters = {
      ...makeAdapters(),
      config: {
        maxFilesPerPhase: 10,
        minIterations: 1,
        maxIterations: 5,
        taskValidation: {
          'gather-recon': { type: 'minLength', value: 5, maxRetries: 0 },
        },
      },
    }

    const result = await handleGatherRecon(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(result.recon).toBe('enough')
  })
})
