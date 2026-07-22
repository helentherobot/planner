import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../types.js'
import { send } from '@helentherobot/runner'
import {
  resolveProfile,
  resolveTools,
  extractText,
  validateOutput,
  mergeTaskValidation,
} from '../helpers.js'
import { systemPrompt } from '../prompts/gather-recon/system.js'

export async function handleGatherRecon(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const mergedValidation = mergeTaskValidation(adapters.config.taskValidation)
  const entry = mergedValidation[task.type]

  const sessionOptions = {
    profile: await resolveProfile(adapters, task.type),
    systemPrompt,
    tools: resolveTools(adapters, task.type),
    maxSteps: 20,
  }

  const userMessage = state.reconAmendment
    ? `${state.brief}\n\nPrevious recon was rejected: ` +
      `${state.reconAmendment}. Address this and produce a corrected recon.`
    : state.brief

  let messages: (import('@helentherobot/runner').ModelMessage | string)[] = [
    userMessage,
  ]

  let taskStartedAt = Date.now()
  let result = await send(adapters.tools.runner, sessionOptions, messages)
  let taskDurationMs = Date.now() - taskStartedAt

  adapters.onUsage?.({
    taskType: task.type,
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

  while (!check.valid && retries < (entry?.maxRetries ?? 0)) {
    retries++
    messages = [
      ...result.messages,
      { role: 'user', content: check.retryPrompt },
    ]
    taskStartedAt = Date.now()
    result = await send(adapters.tools.runner, sessionOptions, messages)
    taskDurationMs = Date.now() - taskStartedAt

    adapters.onUsage?.({
      taskType: task.type,
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

  if (!check.valid) throw new Error('gather-recon-validation-failed')

  return {
    ...state,
    recon: text,
    remainingTasks: [{ type: 'check-recon' }, ...state.remainingTasks],
  }
}
