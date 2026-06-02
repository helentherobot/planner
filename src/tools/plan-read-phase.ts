import type { DiscoverableTool } from '@helentherobot/runner'
import type { Store } from '@/types.js'
import { makeDiscoverable } from '@/tools/helpers.js'

export function makePlanReadPhase(store: Store, phase: number): DiscoverableTool {
  return makeDiscoverable(
    '__plan_read_phase',
    'Read the current implementation plan for this phase.',
    { type: 'object', properties: {}, required: [] },
    async () => {
      const current = store.read()
      return current?.phases[phase]?.brief ?? ''
    },
  )
}
