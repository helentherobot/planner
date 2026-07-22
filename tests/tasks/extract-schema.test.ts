import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleExtractSchema } from '../../src/tasks/extract-schema.js'
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
    title: 'Phase 0',
    brief: 'Build a users table with id, name, email columns.',
    controls: {},
    iterations: 0,
    ...overrides,
  }
}

function makeState(overrides: Partial<PlanState> = {}): PlanState {
  return {
    brief: 'Build something.',
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

const task: Task = { type: 'extract-schema', phase: 0 }

const VALID_SCHEMA = JSON.stringify({
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'integer', primaryKey: true },
        { name: 'name', type: 'text' },
        { name: 'email', type: 'text' },
      ],
      primaryKeyStyle: 'integer',
    },
  ],
})

describe('handleExtractSchema', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('valid schema: populates state.schemaArtifact', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult(VALID_SCHEMA))
    const state = makeState()
    const adapters = makeAdapters()

    const result = await handleExtractSchema(task, state, adapters)

    expect(result.schemaArtifact).toBe(VALID_SCHEMA)
  })

  it('empty tables: sets schemaArtifact to null', async () => {
    mockSend.mockResolvedValueOnce(
      makeSendResult(JSON.stringify({ tables: [] })),
    )
    const state = makeState()
    const adapters = makeAdapters()

    const result = await handleExtractSchema(task, state, adapters)

    expect(result.schemaArtifact).toBeNull()
  })

  it('malformed JSON: retries and throws when exhausted', async () => {
    mockSend.mockResolvedValue(makeSendResult('not json at all'))
    const state = makeState()
    const adapters = makeAdapters()

    await expect(handleExtractSchema(task, state, adapters)).rejects.toThrow(
      'extract-schema-validation-failed',
    )
    expect(mockSend).toHaveBeenCalledTimes(3)
  })

  it('retry path: invalid first, valid second returns populated artifact', async () => {
    mockSend
      .mockResolvedValueOnce(makeSendResult('not json'))
      .mockResolvedValueOnce(makeSendResult(VALID_SCHEMA))
    const state = makeState()
    const adapters = makeAdapters()

    const result = await handleExtractSchema(task, state, adapters)

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(result.schemaArtifact).toBe(VALID_SCHEMA)
  })

  it('user message contains phase 0 brief', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult(VALID_SCHEMA))
    const state = makeState()
    const adapters = makeAdapters()

    await handleExtractSchema(task, state, adapters)

    const [, , messages] = mockSend.mock.calls[0]
    expect(messages[0]).toBe(
      'Build a users table with id, name, email columns.',
    )
  })

  it('calls onUsage with extract-schema taskType', async () => {
    mockSend.mockResolvedValueOnce(makeSendResult(VALID_SCHEMA))
    const onUsage = vi.fn()
    const adapters = { ...makeAdapters(), onUsage }

    await handleExtractSchema(task, makeState(), adapters)

    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'extract-schema' }),
    )
  })
})
