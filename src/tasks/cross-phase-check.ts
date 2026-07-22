import type { Task, PlanState, CrossPhaseFinding } from '../types.js'
import type { Adapters } from '../types.js'
import { send } from '@helentherobot/runner'
import { resolveProfile, extractText, validateOutput } from '../helpers.js'

const systemPrompt = `
  You are reviewing the implementation indexes of each phase in a
  multi-phase plan. Your job is to identify cross-phase contradictions.

  Look for:
  - Column name conflicts (same table, different column names across
    phases)
  - Mismatched ID types (one phase uses integer IDs, another uses UUIDs
    for the same entity)
  - File ownership conflicts (two phases claim to create or own the same
    file)
  - Inconsistent route definitions (same route path defined differently
    in different phases)

  Respond with only a JSON object in this exact shape:
  { "findings": CrossPhaseFinding[] }

  Where CrossPhaseFinding is:
  { "phases": number[], "description": string }

  "phases" lists the phase numbers (0-based) involved in the
  contradiction. "description" is a concise plain-text description of
  the contradiction. If there are no contradictions, return
  { "findings": [] }. Output only the JSON object — no prose, no
  markdown.
`

const validationEntry = {
  type: 'schema' as const,
  required: ['findings'],
  maxRetries: 2,
}

export async function handleCrossPhaseCheck(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const indexedPhases = state.phases
    .map((phase, i) => ({ phase, i }))
    .filter(({ phase }) => phase.index && phase.index.trim().length > 0)

  if (indexedPhases.length === 0) {
    return { ...state, crossPhaseFindings: [] }
  }

  const totalLength = indexedPhases.reduce(
    (sum, { phase }) => sum + (phase.index?.length ?? 0),
    0,
  )

  if (
    adapters.config.maxCrossPhaseIndexLength !== undefined &&
    totalLength > adapters.config.maxCrossPhaseIndexLength
  ) {
    return { ...state, crossPhaseFindings: [] }
  }

  const indexSections = indexedPhases
    .map(({ phase, i }) => `Phase ${i}:\n${phase.index}`)
    .join('\n\n')

  const userMessage = `Review the following phase indexes for
cross-phase contradictions:\n\n${indexSections}`

  const sessionOptions = {
    profile: await resolveProfile(adapters, 'cross-phase-check'),
    systemPrompt,
    tools: [],
  }

  let messages: (import('@helentherobot/runner').ModelMessage | string)[] = [
    userMessage,
  ]

  let taskStartedAt = Date.now()
  let result = await send(adapters.tools.runner, sessionOptions, messages)
  let taskDurationMs = Date.now() - taskStartedAt

  adapters.onUsage?.({
    taskType: 'cross-phase-check',
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
  let check = validateOutput(validationEntry, text)
  let retries = 0

  while (!check.valid && retries < validationEntry.maxRetries) {
    retries++
    messages = [
      ...result.messages,
      { role: 'user', content: check.retryPrompt },
    ]
    taskStartedAt = Date.now()
    result = await send(adapters.tools.runner, sessionOptions, messages)
    taskDurationMs = Date.now() - taskStartedAt

    adapters.onUsage?.({
      taskType: 'cross-phase-check',
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
    check = validateOutput(validationEntry, text)
  }

  if (!check.valid) throw new Error('cross-phase-check-validation-failed')

  const parsed = JSON.parse(text) as { findings: unknown }
  const findings: CrossPhaseFinding[] = Array.isArray(parsed.findings)
    ? (parsed.findings as CrossPhaseFinding[])
    : []

  if (findings.length === 0) {
    return { ...state, crossPhaseFindings: [] }
  }

  if (task.secondPass === true) {
    return { ...state, crossPhaseFindings: findings }
  }

  const reviseTasks: Task[] = []
  for (const finding of findings) {
    for (const phaseIndex of finding.phases) {
      reviseTasks.push({
        type: 'revise-phase',
        phase: phaseIndex,
        crossPhaseFinding: finding,
      })
    }
  }

  return {
    ...state,
    crossPhaseFindings: findings,
    remainingTasks: [
      ...reviseTasks,
      { type: 'cross-phase-check', secondPass: true },
      ...state.remainingTasks,
    ],
  }
}
