import type { DiscoverableTool } from '@helentherobot/runner'
import type { Store, PlanState } from '@/types.js'
import { makeDiscoverable } from '@/tools/helpers.js'

export function makePlanWriteRecon(store: Store, fallbackState: PlanState): DiscoverableTool {
  return makeDiscoverable(
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
      const current = store.read() ?? fallbackState
      store.write({ ...current, recon: content as string })
      return 'Recon written.'
    },
  )
}
