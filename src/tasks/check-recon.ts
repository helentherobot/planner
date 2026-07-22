import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../types.js'
import { send } from '@helentherobot/runner'
import {
  resolveProfile,
  resolveTools,
  extractText,
  validateOutput,
} from '../helpers.js'

const systemPrompt = `
  You are verifying the accuracy of a codebase reconnaissance report.
  Use available tools to inspect the project. For each file path
  mentioned in the recon, verify it actually exists. Confirm that
  library and technology claims match what is installed and configured
  in the project. Identify any relevant areas of the codebase that are
  absent from the recon.

  Respond with only a JSON object in this exact shape:
  { "pass": boolean, "gap": string | null }

  Set "pass" to true if the recon is accurate and sufficiently
  complete. Set "pass" to false if there are material inaccuracies or
  significant omissions. If "pass" is false, set "gap" to a concise
  description of what is wrong or missing. If "pass" is true, set
  "gap" to null. Output only the JSON object — no prose, no markdown.
`

const validationEntry = {
  type: 'schema' as const,
  required: ['pass', 'gap'],
  maxRetries: 2,
}

export async function handleCheckRecon(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const entry = validationEntry

  const sessionOptions = {
    profile: await resolveProfile(adapters, 'check-recon'),
    systemPrompt,
    tools: resolveTools(adapters, 'check-recon'),
    maxSteps: 20,
  }

  const userMessage = `Here is the existing recon:\n\n${state.recon}`

  let messages: (import('@helentherobot/runner').ModelMessage | string)[] = [
    userMessage,
  ]

  let taskStartedAt = Date.now()
  let result = await send(adapters.tools.runner, sessionOptions, messages)
  let taskDurationMs = Date.now() - taskStartedAt

  adapters.onUsage?.({
    taskType: 'check-recon',
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
      taskType: 'check-recon',
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

  if (!check.valid) throw new Error('check-recon-validation-failed')

  const parsed = JSON.parse(text) as { pass: boolean; gap: string | null }
  const { pass, gap } = parsed

  if (pass) {
    return { ...state, reconAmendment: null, reconRetries: 0 }
  }

  const reconRetries = (state.reconRetries ?? 0) + 1

  if (reconRetries <= entry.maxRetries) {
    return {
      ...state,
      reconRetries,
      reconAmendment: gap,
      remainingTasks: [{ type: 'gather-recon' }, ...state.remainingTasks],
    }
  }

  throw new Error('recon-incomplete')
}
