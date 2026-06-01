import type { ToolSet } from 'ai'
import type { Runner } from '@helentherobot/runner'

export interface Tools {
  runner: Runner
  profile: string
  cwd: string
  agentTools: ToolSet
}
