import type { Task } from './types.js'
import { phaseTaskOrder } from './phase-map.js'

export function expandPhases(phases: string[]): Task[] {
  const tasks: Task[] = []

  for (let i = 0; i < phases.length; i++) {
    for (const type of phaseTaskOrder) {
      tasks.push({ type, phase: i })
    }
  }

  tasks.push({ type: 'reorder-phases' })
  tasks.push({ type: 'cleanup' })

  return tasks
}
