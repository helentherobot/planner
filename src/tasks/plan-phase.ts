import type { Task, PlanState } from '@/types.js'
import type { Adapters } from '@/types.js'
import { send } from '@helentherobot/runner'
import { resolveProfile, resolveTools, updatePhase } from '@/helpers.js'
import { makePlanReadPhase } from '@/tools/plan-read-phase.js'
import { systemPrompt } from '@/prompts/plan-phase/system.js'

export async function handlePlanPhase(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]
  const userMessage = phaseState.prompt ?? phaseState.brief

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
