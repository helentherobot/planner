import { describe, it } from 'vitest'
import type { Config, ControlState, PhaseState, Task, PlanState } from '@/index.js'

describe('types', () => {
  it('Config is exported and assignable', () => {
    const config: Config = {
      maxFilesPerPhase: 10,
      minimumIterations: 1,
      maximumIterations: 5,
    }
    void config
  })

  it('ControlState is exported and assignable', () => {
    const controlState: ControlState = {
      dismissed: [],
      raised: [],
    }
    void controlState
  })

  it('PhaseState is exported and assignable', () => {
    const phaseState: PhaseState = {
      title: 'Phase one',
      brief: 'Do the thing',
      controls: {},
      iterations: 0,
    }
    void phaseState
  })

  it('Task is exported and assignable', () => {
    const task: Task = {
      type: 'synthesize-phases',
    }
    void task
  })

  it('PlanState is exported and assignable', () => {
    const config: Config = {
      maxFilesPerPhase: 10,
      minimumIterations: 1,
      maximumIterations: 5,
    }
    const planState: PlanState = {
      brief: 'Build a thing',
      recon: '',
      startedAt: Date.now(),
      completedAt: null,
      currentTask: null,
      progressHandle: null,
      config,
      phases: [],
      remainingTasks: [],
      completedTasks: [],
    }
    void planState
  })
})
