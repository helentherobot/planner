import type { DiscoverableTool } from '@helentherobot/runner'
import { jsonSchema } from 'ai'

export function makeDiscoverable(
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
