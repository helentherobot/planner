import type { Task, PlanState } from '../types.js'
import type { Adapters } from '../adapters.js'
import type { DiscoverableTool } from '@helentherobot/runner'
import { send } from '@helentherobot/runner'
import { jsonSchema } from 'ai'
import { updatePhase } from '../store-helpers.js'

function makeDiscoverable(
  name: string,
  description: string,
  schema: object,
  execute: (args: Record<string, unknown>) => Promise<string>,
): DiscoverableTool {
  return {
    name,
    description,
    inputSchema: jsonSchema(schema as Parameters<typeof jsonSchema>[0]),
    execute: execute as DiscoverableTool['execute'],
  } as DiscoverableTool
}

function toolSetToDiscoverable(agentTools: Adapters['tools']['agentTools']): DiscoverableTool[] {
  return Object.entries(agentTools).map(([name, tool]) => ({ ...tool, name }) as DiscoverableTool)
}

export async function handlePlanPhase(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phase = task.phase!
  const phaseState = state.phases[phase]
  const userMessage = phaseState.prompt ?? phaseState.brief

  const planWritePhase = makeDiscoverable(
    '__plan_write_phase',
    'Write the implementation plan for a phase.',
    {
      type: 'object',
      properties: {
        phase: { type: 'number', description: 'Phase index (zero-based)' },
        content: { type: 'string', description: 'The implementation plan content' },
      },
      required: ['phase', 'content'],
    },
    async ({ phase: p, content }: Record<string, unknown>) => {
      updatePhase(adapters.store, p as number, { brief: content as string })
      return 'Plan written.'
    },
  )

  const planReadPhase = makeDiscoverable(
    '__plan_read_phase',
    'Read the current implementation plan for a phase.',
    {
      type: 'object',
      properties: {
        phase: { type: 'number', description: 'Phase index (zero-based)' },
      },
      required: ['phase'],
    },
    async ({ phase: p }: Record<string, unknown>) => {
      const current = adapters.store.read()
      return current?.phases[p as number]?.brief ?? ''
    },
  )

  const planWriteRecon = makeDiscoverable(
    '__plan_write_recon',
    'Write reconnaissance notes about the project.',
    {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The recon content' },
      },
      required: ['content'],
    },
    async ({ content }: Record<string, unknown>) => {
      const current = adapters.store.read() ?? state
      adapters.store.write({ ...current, recon: content as string })
      return 'Recon written.'
    },
  )

  const planReadRecon = makeDiscoverable(
    '__plan_read_recon',
    'Read the current reconnaissance notes.',
    { type: 'object', properties: {}, required: [] },
    async () => {
      const current = adapters.store.read()
      return current?.recon ?? ''
    },
  )

  const planTools: DiscoverableTool[] = [
    planWritePhase,
    planReadPhase,
    planWriteRecon,
    planReadRecon,
    ...toolSetToDiscoverable(adapters.tools.agentTools),
  ]

  await send(adapters.tools.runner, { profile: adapters.tools.profile, tools: planTools }, [
    userMessage,
  ])

  return { ...state, phases: adapters.store.read()!.phases }
}
