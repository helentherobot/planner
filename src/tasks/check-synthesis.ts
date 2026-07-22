import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../types.js'
import { send } from '@helentherobot/runner'
import {
  resolveProfile,
  resolveTools,
  expandPhases,
  extractText,
  validateOutput,
} from '../helpers.js'

const systemPrompt = `
  You are verifying the quality of a proposed implementation phase
  list. Use available tools to inspect the project if needed. Verify
  that all proposed phases collectively cover the brief and the recon.
  Check that no phase title refers to a non-existent component or
  path. Confirm that phase ordering is logically coherent — earlier
  phases must not depend on work defined in later phases.

  Respond with only a JSON object in this exact shape:
  { "pass": boolean, "gap": string | null }

  Set "pass" to true if the phase list is coherent and complete. Set
  "pass" to false if there are coverage gaps, incoherent ordering, or
  titles that reference non-existent components. If "pass" is false,
  set "gap" to a concise description of the problem. If "pass" is
  true, set "gap" to null. Output only the JSON object — no prose, no
  markdown.
`

const validationEntry = {
  type: 'schema' as const,
  required: ['pass', 'gap'],
  maxRetries: 2,
}

export async function handleCheckSynthesis(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const entry = validationEntry

  const sessionOptions = {
    profile: await resolveProfile(adapters, 'check-synthesis'),
    systemPrompt,
    tools: resolveTools(adapters, 'check-synthesis'),
    maxSteps: 20,
  }

  const phaseTitles = state.phases.map((p) => p.title).join('\n')
  const userMessage =
    `Brief:\n${state.brief}\n\nRecon:\n${state.recon}\n\n` +
    `Proposed phases:\n${phaseTitles}`

  let messages: (import('@helentherobot/runner').ModelMessage | string)[] = [
    userMessage,
  ]

  let taskStartedAt = Date.now()
  let result = await send(adapters.tools.runner, sessionOptions, messages)
  let taskDurationMs = Date.now() - taskStartedAt

  adapters.onUsage?.({
    taskType: 'check-synthesis',
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
      taskType: 'check-synthesis',
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

  if (!check.valid) throw new Error('check-synthesis-validation-failed')

  const parsed = JSON.parse(text) as { pass: boolean; gap: string | null }
  const { pass, gap } = parsed

  if (pass) {
    const phaseTasks = expandPhases(state.phases.map((p) => p.title))
    return {
      ...state,
      synthesisAmendment: null,
      synthesisRetries: 0,
      remainingTasks: [...phaseTasks, ...state.remainingTasks],
    }
  }

  const synthesisRetries = (state.synthesisRetries ?? 0) + 1

  if (synthesisRetries <= entry.maxRetries) {
    return {
      ...state,
      synthesisRetries,
      synthesisAmendment: gap,
      remainingTasks: [{ type: 'synthesize-phases' }, ...state.remainingTasks],
    }
  }

  throw new Error('synthesis-incomplete')
}
