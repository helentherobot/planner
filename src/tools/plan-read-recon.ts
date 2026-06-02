import type { DiscoverableTool } from '@helentherobot/runner'
import type { Store } from '@/types.js'
import { makeDiscoverable } from '@/tools/helpers.js'

export function makePlanReadRecon(store: Store): DiscoverableTool {
  return makeDiscoverable(
    '__plan_read_recon',
    'Read the current reconnaissance notes.',
    { type: 'object', properties: {}, required: [] },
    async () => {
      const current = store.read()
      return current?.recon ?? ''
    },
  )
}
