import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../types.js'
import { send } from '@helentherobot/runner'
import {
  resolveProfile,
  resolveTools,
  updatePhase,
  extractText,
  validateOutput,
  mergeTaskValidation,
} from '../helpers.js'
import { makePlanReadPhase } from '../tools/plan-read-phase.js'
import { systemPrompt } from '../prompts/plan-phase/system.js'

export async function handlePlanPhase(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const mergedValidation = mergeTaskValidation(adapters.config.taskValidation)
  const entry = mergedValidation[task.type]

  const phase = task.phase!
  const phaseState = state.phases[phase]

  const otherPhases = state.phases
    .map((p, i) => ({ index: i, title: p.title, fileIndex: p.index ?? '' }))
    .filter((p) => p.index !== phase && p.fileIndex.length > 0)

  const other = otherPhases
    .map((p) => `Phase ${p.index + 1} — ${p.title}:\n${p.fileIndex}`)
    .join('\n\n')

  const crossPhaseBlock =
    otherPhases.length > 0
      ? `Other phases already planned — avoid these files unless this phase specifically requires them: ${other}`
      : ''

  const answeredQuestionsBlock =
    state.answeredQuestions.length > 0
      ? [
          '## Resolved decisions',
          'The following questions have been answered — treat these as settled decisions:',
          ...state.answeredQuestions.map(
            (q) => `Q: ${q.question}\nA: ${q.answer}`,
          ),
          '',
        ].join('\n')
      : ''

  const userMessage =
    answeredQuestionsBlock +
    crossPhaseBlock +
    (phaseState.prompt ?? phaseState.brief)

  const sessionOptions = {
    profile: await resolveProfile(adapters, task.type),
    systemPrompt,
    tools: [
      makePlanReadPhase(adapters.store, phase),
      ...resolveTools(adapters, task.type),
    ],
    maxSteps: 20,
  }

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

  if (!check.valid) throw new Error('plan-phase-validation-failed')

  if (text) {
    updatePhase(adapters.store, phase, { brief: text })
  }

  return { ...state, phases: adapters.store.read()!.phases }
}
