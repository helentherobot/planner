import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleCheckRecon } from '../../src/tasks/check-recon.js'
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
    recon: 'The project uses TypeScript and Node.js.',
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

const task: Task = { type: 'check-recon' }

describe('handleCheckRecon', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('pass path: clears reconAmendment and resets reconRetries', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"pass":true,"gap":null}'))
    const state = makeState({ reconAmendment: 'missing X', reconRetries: 1 })
    const adapters = makeAdapters()

    const result = await handleCheckRecon(task, state, adapters)

    expect(result.reconAmendment).toBeNull()
    expect(result.reconRetries).toBe(0)
    expect(result.remainingTasks.some((t) => t.type === 'gather-recon')).toBe(
      false,
    )
  })

  it('fail path: sets reconAmendment and prepends gather-recon', async () => {
    mockSend.mockResolvedValueOnce(
      makeSendResult('{"pass":false,"gap":"missing X"}'),
    )
    const state = makeState()
    const adapters = makeAdapters()

    const result = await handleCheckRecon(task, state, adapters)

    expect(result.reconAmendment).toBe('missing X')
    expect(result.reconRetries).toBe(1)
    expect(result.remainingTasks[0].type).toBe('gather-recon')
  })

  it('fail path: preserves existing remainingTasks after prepend', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"pass":false,"gap":"gap"}'))
    const state = makeState({
      remainingTasks: [{ type: 'synthesize-phases' }],
    })
    const adapters = makeAdapters()

    const result = await handleCheckRecon(task, state, adapters)

    expect(result.remainingTasks[0].type).toBe('gather-recon')
    expect(result.remainingTasks[1].type).toBe('synthesize-phases')
  })

  it('exhausted retries: throws recon-incomplete', async () => {
    mockSend.mockResolvedValueOnce(
      makeSendResult('{"pass":false,"gap":"still missing"}'),
    )
    const state = makeState({ reconRetries: 2 })
    const adapters = makeAdapters()

    await expect(handleCheckRecon(task, state, adapters)).rejects.toThrow(
      'recon-incomplete',
    )
  })

  it('schema validation retry: invalid JSON retries up to maxRetries', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult('not json'))
      .mockResolvedValueOnce(makeSendResult('{"pass":true,"gap":null}'))

    const state = makeState()
    const adapters = makeAdapters()

    const result = await handleCheckRecon(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(result.reconAmendment).toBeNull()
  })

  it('user message includes recon content', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"pass":true,"gap":null}'))
    const state = makeState({ recon: 'Detailed recon content here.' })
    const adapters = makeAdapters()

    await handleCheckRecon(task, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    const userMessage = messages[0] as string
    expect(userMessage).toContain('Detailed recon content here.')
    expect(userMessage).toContain('Here is the existing recon:')
  })

  it('calls onUsage with check-recon taskType', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('{"pass":true,"gap":null}'))
    const onUsage = vi.fn()
    const adapters = { ...makeAdapters(), onUsage }

    await handleCheckRecon(task, makeState(), adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'check-recon' }),
    )
  })
})
