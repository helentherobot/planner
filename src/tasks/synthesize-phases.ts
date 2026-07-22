import type { Task, PlanState, PhaseState } from '../types.js'
import type { Adapters } from '../types.js'
import { send } from '@helentherobot/runner'
import {
  resolveProfile,
  extractText,
  validateOutput,
  mergeTaskValidation,
} from '../helpers.js'
import { prompt } from '../prompts/synthesize-phases/recipe.js'

export async function handleSynthesizePhases(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const mergedValidation = mergeTaskValidation(adapters.config.taskValidation)
  const entry = mergedValidation[task.type]

  const basePrompt = prompt({
    brief: state.brief,
    recon: state.recon,
    answeredQuestions: state.answeredQuestions,
  })

  const promptText = state.synthesisAmendment
    ? `${basePrompt}\n\nPrevious synthesis was rejected: ` +
      `${state.synthesisAmendment}. Address this and produce a corrected ` +
      `phase list.`
    : basePrompt

  const sessionOptions = {
    profile: await resolveProfile(adapters, task.type),
  }

  let messages: (import('@helentherobot/runner').ModelMessage | string)[] = [
    promptText,
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

  if (!check.valid) throw new Error('synthesize-phases-validation-failed')

  const titles = text
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)

  const phases: PhaseState[] = titles.map((title) => ({
    title,
    brief: '',
    controls: {},
    iterations: 0,
  }))

  return {
    ...state,
    phases,
    remainingTasks: [{ type: 'check-synthesis' }, ...state.remainingTasks],
  }
}
