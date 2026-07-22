import type { Task, PlanState, Adapters } from '../types.js'
import { send } from '@helentherobot/runner'
import {
  resolveTools,
  resolveProfile,
  resolveOptions,
  extractText,
  validateOutput,
  mergeTaskValidation,
} from '../helpers.js'
import {
  systemPrompt,
  userMessage,
} from '../prompts/resolve-phase-questions/index.js'

export async function handleResolvePhaseQuestions(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phaseQuestions = state.pendingQuestions.filter((q) =>
    Array.isArray(q.phaseIndex)
      ? q.phaseIndex.includes(task.phase!)
      : q.phaseIndex === task.phase,
  )

  if (phaseQuestions.length === 0) {
    return state
  }

  const opts = resolveOptions(adapters, 'resolve-phase-questions')
  const mergedValidation = mergeTaskValidation(adapters.config.taskValidation)
  const entry = mergedValidation[task.type]

  const phase = state.phases[task.phase!]
  const tools = resolveTools(adapters, task.type)
  const profile = await resolveProfile(adapters, task.type)
  const maxSteps = adapters.config.maxStepsPerQuestion ?? 5
  const effectiveSystemPrompt = opts.jsonMode
    ? systemPrompt +
      '\nRespond with only valid JSON. Do not include prose, markdown' +
      ' fences, or explanations outside the JSON object.'
    : systemPrompt
  const sessionOptions = {
    profile,
    systemPrompt: effectiveSystemPrompt,
    tools,
    maxSteps,
  }

  let current = state

  for (const question of phaseQuestions) {
    const otherPhases = current.phases
      .map((p, i) => ({ index: i, title: p.title, fileIndex: p.index ?? '' }))
      .filter((p) => p.index !== task.phase!)

    const userMsg = userMessage({
      phaseIndex: task.phase!,
      phaseTitle: phase.title,
      question,
      answeredQuestions: current.answeredQuestions,
      otherPhases,
    })

    let messages: (import('@helentherobot/runner').ModelMessage | string)[] = [
      userMsg,
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

    if (!check.valid) {
      throw new Error('resolve-phase-questions-validation-failed')
    }

    let parsed: { result: string; answer?: string; context?: string }
    try {
      parsed = JSON.parse(text.trim())
    } catch {
      const stripped = text.replace(/```(?:json)?\n?/g, '').trim()
      const jsonMatch = stripped.match(/\{[\s\S]*\}/)
      if (!jsonMatch) continue
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        continue
      }
    }

    if (parsed.result === 'answered' && parsed.answer !== undefined) {
      current = {
        ...current,
        pendingQuestions: current.pendingQuestions.filter(
          (q) => q.id !== question.id,
        ),
        answeredQuestions: [
          ...current.answeredQuestions,
          { ...question, answer: parsed.answer },
        ],
      }
    } else if (parsed.result === 'enriched' && parsed.context !== undefined) {
      current = {
        ...current,
        pendingQuestions: current.pendingQuestions.map((q) =>
          q.id === question.id ? { ...q, context: parsed.context } : q,
        ),
      }
    }
  }

  return current
}
