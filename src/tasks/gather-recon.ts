import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../types.js'
import { send } from '@helentherobot/runner'
import { resolveProfile, resolveTools } from '../helpers.js'
import { systemPrompt } from '../prompts/gather-recon/system.js'

export async function handleGatherRecon(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const taskStartedAt = Date.now()
  const result = await send(
    adapters.tools.runner,
    {
      profile: await resolveProfile(adapters, task.type),
      systemPrompt,
      tools: resolveTools(adapters, task.type),
      maxSteps: 20,
    },
    [state.brief],
  )
  const taskDurationMs = Date.now() - taskStartedAt

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

  const lastMessage = result.messages.at(-1)
  const recon =
    lastMessage?.role === 'assistant'
      ? Array.isArray(lastMessage.content)
        ? lastMessage.content
            .filter((p) => p.type === 'text')
            .map((p) => ('text' in p ? (p as { text: string }).text : ''))
            .join('')
        : String(lastMessage.content)
      : ''

  return { ...state, recon }
}
