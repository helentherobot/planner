import type { Task, PlanState, SchemaArtifact } from '../types.js'
import type { Adapters } from '../types.js'
import { send } from '@helentherobot/runner'
import { resolveProfile, extractText, validateOutput } from '../helpers.js'

const systemPrompt = `
  Extract all database table and column definitions from the provided
  phase brief. Return a JSON object matching this exact shape:
  {
    "tables": [
      {
        "name": string,
        "columns": [
          { "name": string, "type": string, "primaryKey": boolean }
        ],
        "primaryKeyStyle": "integer" | "uuid" | "string" | "unknown"
      }
    ]
  }

  Respond with only the JSON object — no prose, no markdown fences,
  no explanation. If no tables are defined, return { "tables": [] }.
`

const validationEntry = {
  type: 'schema' as const,
  required: ['tables'],
  maxRetries: 2,
}

export async function handleExtractSchema(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const entry = validationEntry

  const sessionOptions = {
    profile: await resolveProfile(adapters, 'extract-schema'),
    systemPrompt,
  }

  const userMessage = state.phases[0].brief

  let messages: (import('@helentherobot/runner').ModelMessage | string)[] = [
    userMessage,
  ]

  let taskStartedAt = Date.now()
  let result = await send(adapters.tools.runner, sessionOptions, messages)
  let taskDurationMs = Date.now() - taskStartedAt

  adapters.onUsage?.({
    taskType: 'extract-schema',
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    totalCostUsd: result.usage.totalCostUsd,
    ...(result.usage.reasoningTokens != null
      ? { reasoningTokens: result.usage.reasoningTokens }
      : {}),
    ...(result.usage.cachedInputTokens != null
      ? { cachedInputTokens: result.usage.cachedInputTokens }
      : {}),
    taskStartedAt,
    taskDurationMs,
  })

  let text = extractText(result.messages)
  let check = validateOutput(entry, text)
  let retries = 0

  while (!check.valid && retries < entry.maxRetries) {
    retries++
    messages = [
      ...result.messages,
      { role: 'user', content: check.retryPrompt },
    ]
    taskStartedAt = Date.now()
    result = await send(adapters.tools.runner, sessionOptions, messages)
    taskDurationMs = Date.now() - taskStartedAt

    adapters.onUsage?.({
      taskType: 'extract-schema',
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalCostUsd: result.usage.totalCostUsd,
      ...(result.usage.reasoningTokens != null
        ? { reasoningTokens: result.usage.reasoningTokens }
        : {}),
      ...(result.usage.cachedInputTokens != null
        ? { cachedInputTokens: result.usage.cachedInputTokens }
        : {}),
      taskStartedAt,
      taskDurationMs,
    })

    text = extractText(result.messages)
    check = validateOutput(entry, text)
  }

  if (!check.valid) throw new Error('extract-schema-validation-failed')

  const parsed = JSON.parse(text) as SchemaArtifact

  if (parsed.tables.length === 0) {
    return { ...state, schemaArtifact: null }
  }

  return { ...state, schemaArtifact: JSON.stringify(parsed) }
}
