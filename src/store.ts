import type { PlanState } from './types.js'

export interface Store {
  read(): PlanState | null
  write(state: PlanState): void
}
