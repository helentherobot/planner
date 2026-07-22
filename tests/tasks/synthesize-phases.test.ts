import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSynthesizePhases } from '../../src/tasks/synthesize-phases.js'
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
    ...overrides,
  }
}

function makeAdapters(onUsage?: Adapters['onUsage']): Adapters {
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
    onUsage,
  }
}

function makeSendResult(text: string) {
  return {
    messages: [{ role: 'assistant' as const, content: text }],
    usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 },
  }
}

const task: Task = { type: 'synthesize-phases' }

describe('handleSynthesizePhases', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('calls onUsage with the correct taskType after send resolves', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('1. Phase One\n2. Phase Two'))
    const onUsage = vi.fn()
    const adapters = makeAdapters(onUsage)

    await handleSynthesizePhases(task, makeState(), adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'synthesize-phases',
        inputTokens: 10,
      }),
    )
  })

  it('does not error when onUsage is not provided', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('1. Phase One'))
    const adapters = makeAdapters()

    await expect(
      handleSynthesizePhases(task, makeState(), adapters),
    ).resolves.not.toThrow()
  })

  it('builds phases from numbered list in response', async () => {
    mockSend.mockResolvedValueOnce(
      makeSendResult('1. Phase One\n2. Phase Two\n3. Phase Three'),
    )
    const adapters = makeAdapters()

    const result = await handleSynthesizePhases(task, makeState(), adapters)

    expect(result.phases).toHaveLength(3)
    expect(result.phases[0].title).toBe('Phase One')
    expect(result.phases[1].title).toBe('Phase Two')
    expect(result.phases[2].title).toBe('Phase Three')
  })

  it('prepends check-synthesis to remainingTasks (expandPhases is deferred)', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('1. Phase One\n2. Phase Two'))
    const adapters = makeAdapters()

    const result = await handleSynthesizePhases(task, makeState(), adapters)

    expect(result.remainingTasks[0].type).toBe('check-synthesis')
    expect(result.remainingTasks.some((t) => t.type === 'cleanup')).toBe(false)
  })

  it('appends synthesisAmendment to prompt when set', async () => {
    const state = makeState({ synthesisAmendment: 'Phase order is wrong' })
    mockSend.mockResolvedValueOnce(makeSendResult('1. Phase One'))
    const adapters = makeAdapters()

    await handleSynthesizePhases(task, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    const promptText = messages[0] as string
    expect(promptText).toContain('Previous synthesis was rejected')
    expect(promptText).toContain('Phase order is wrong')
  })

  it('does not append amendment section when synthesisAmendment is null', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('1. Phase One'))
    const adapters = makeAdapters()

    await handleSynthesizePhases(task, makeState(), adapters)

    const [, , messages] = mockSend.mock.calls[0]
    const promptText = messages[0] as string
    expect(promptText).not.toContain('Previous synthesis was rejected')
  })

  it('includes resolved decisions in the prompt sent to send', async () => {
    const state = {
      ...makeState(),
      answeredQuestions: [
        { id: 'recon-0', question: 'Use REST or GraphQL?', answer: 'REST' },
      ],
    }
    mockSend.mockResolvedValueOnce(makeSendResult('1. Phase One'))
    const adapters = makeAdapters()

    await handleSynthesizePhases(task, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    const promptText = messages[0] as string
    expect(promptText).toContain('Resolved decisions')
    expect(promptText).toContain('Use REST or GraphQL?')
    expect(promptText).toContain('REST')
  })

  it('omits resolved decisions section when answeredQuestions is empty', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult('1. Phase One'))
    const adapters = makeAdapters()

    await handleSynthesizePhases(task, makeState(), adapters)

    const [, , messages] = mockSend.mock.calls[0]
    const promptText = messages[0] as string
    expect(promptText).not.toContain('Resolved decisions')
  })

  it('retry path: first call returns empty, second returns valid list', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult(''))
      .mockResolvedValueOnce(makeSendResult('1. Phase One'))

    const adapters = makeAdapters()
    const result = await handleSynthesizePhases(task, makeState(), adapters)

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(result.phases).toHaveLength(1)
  })

  it('exhausted retries: all calls return empty, throws', async () => {
    mockSend.mockResolvedValue(makeSendResult(''))
    const adapters = makeAdapters()

    await expect(
      handleSynthesizePhases(task, makeState(), adapters),
    ).rejects.toThrow('synthesize-phases-validation-failed')
    expect(mockSend).toHaveBeenCalledTimes(3)
  })
})
