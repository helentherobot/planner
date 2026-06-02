import { describe, it, expect } from 'vitest'
import { expandPhases } from '@/helpers.js'
import { phaseTaskOrder } from '@/helpers.js'

describe('expandPhases', () => {
  it('returns tasks for each phase followed by cleanup', () => {
    const tasks = expandPhases(['Phase A', 'Phase B'])
    const perPhase = phaseTaskOrder.length
    const expected = perPhase * 2 + 1
    expect(tasks).toHaveLength(expected)
    expect(tasks[tasks.length - 1].type).toBe('cleanup')
  })

  it('assigns correct phase numbers', () => {
    const tasks = expandPhases(['Phase A', 'Phase B'])
    const phaseATasks = tasks.filter((t) => t.phase === 0)
    const phaseBTasks = tasks.filter((t) => t.phase === 1)
    expect(phaseATasks).toHaveLength(phaseTaskOrder.length)
    expect(phaseBTasks).toHaveLength(phaseTaskOrder.length)
  })

  it('task types for a phase match phaseTaskOrder', () => {
    const tasks = expandPhases(['Phase A'])
    const phaseTasks = tasks.filter((t) => t.phase === 0)
    const types = phaseTasks.map((t) => t.type)
    expect(types).toEqual(phaseTaskOrder)
  })

  it('returns only cleanup for empty input', () => {
    const tasks = expandPhases([])
    expect(tasks).toHaveLength(1)
    expect(tasks[0].type).toBe('cleanup')
  })
})
