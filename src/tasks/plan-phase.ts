import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../types.js'
import { send } from '@helentherobot/runner'
import { resolveProfile, resolveTools, updatePhase } from '../helpers.js'
import { makePlanReadPhase } from '../tools/plan-read-phase.js'
import { systemPrompt } from '../prompts/plan-phase/system.js'

export async function handlePlanPhase(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
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
          ...state.answeredQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`),
          '',
        ].join('\n')
      : ''

  const userMessage =
    answeredQuestionsBlock + crossPhaseBlock + (phaseState.prompt ?? phaseState.brief)

  const result = await send(
    adapters.tools.runner,
    {
      profile: await resolveProfile(adapters, task.type),
      systemPrompt,
      tools: [makePlanReadPhase(adapters.store, phase), ...resolveTools(adapters, task.type)],
      maxSteps: 20,
    },
    [userMessage],
  )

  adapters.onUsage?.({
    taskType: task.type,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    totalCostUsd: result.usage.totalCostUsd,
  })

  const lastMessage = result.messages.at(-1)
  const brief =
    lastMessage?.role === 'assistant'
      ? Array.isArray(lastMessage.content)
        ? lastMessage.content
            .filter((p) => p.type === 'text')
            .map((p) => ('text' in p ? (p as { text: string }).text : ''))
            .join('')
        : String(lastMessage.content)
      : ''

  if (brief) {
    updatePhase(adapters.store, phase, { brief })
  }

  return { ...state, phases: adapters.store.read()!.phases }
}
