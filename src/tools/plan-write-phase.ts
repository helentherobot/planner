import type { DiscoverableTool } from '@helentherobot/runner'
import type { Store } from '@/types.js'
import { makeDiscoverable } from '@/tools/helpers.js'
import { updatePhase } from '@/helpers.js'

export function makePlanWritePhase(store: Store, phase: number): DiscoverableTool {
  return makeDiscoverable(
    '__plan_write_phase',
    'Write the implementation plan for this phase.',
    {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The implementation plan content' },
      },
      required: ['content'],
    },
    async ({ content }: Record<string, unknown>) => {
      updatePhase(store, phase, { brief: content as string })
      return 'Plan written.'
    },
  )
}
