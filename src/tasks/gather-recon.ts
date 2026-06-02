import type { Task, PlanState } from '@/types.js'
import type { Adapters } from '@/types.js'
import { send } from '@helentherobot/runner'
import { resolveProfile, resolveTools } from '@/helpers.js'
import { gatherRecon as gatherReconRecipe } from '@/recipes/gather-recon.js'

export async function handleGatherRecon(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const result = await send(
    adapters.tools.runner,
    {
      profile: await resolveProfile(adapters, task.type, gatherReconRecipe.profile),
      tools: resolveTools(adapters, task.type),
      maxSteps: 20,
    },
    [gatherReconRecipe.prompt({ brief: state.brief })],
  )

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
