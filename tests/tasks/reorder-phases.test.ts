import { describe, it, expect, vi } from 'vitest'
import { handleReorderPhases } from '@/tasks/reorder-phases.js'
import type { PlanState, PhaseState } from '@/types.js'
import type { Adapters } from '@/adapters.js'
import type { Store } from '@/store.js'

function makePhaseState(title: string): PhaseState {
  return { title, brief: `Brief for ${title}`, controls: {}, iterations: 0 }
}

function makeState(phases: PhaseState[]): PlanState {
  return {
    brief: 'brief',
    recon: '',
    startedAt: Date.now(),
    completedAt: null,
    currentTask: null,
    progressHandle: null,
    config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
    phases,
    remainingTasks: [],
    completedTasks: [],
  }
}

function makeStore(state: PlanState): Store {
  let stored = state
  return {
    read: vi.fn(() => stored),
    write: vi.fn((s) => {
      stored = s
    }),
  }
}

describe('handleReorderPhases', () => {
  it('preserves existing phase order (no-op)', async () => {
    const phases = [makePhaseState('Phase A'), makePhaseState('Phase B'), makePhaseState('Phase C')]
    const state = makeState(phases)
    const store = makeStore(state)

    const adapters: Adapters = {
      tools: {
        runner: {} as Adapters['tools']['runner'],
        profile: 'haiku',
        cwd: '/tmp',
        agentTools: {},
      },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: state.config,
      controls: [],
    }

    const result = await handleReorderPhases({ type: 'reorder-phases' }, state, adapters)

    expect(result.phases.map((p) => p.title)).toEqual(['Phase A', 'Phase B', 'Phase C'])
  })

  it('returns a valid PlanState', async () => {
    const state = makeState([makePhaseState('Phase A')])
    const store = makeStore(state)

    const adapters: Adapters = {
      tools: {
        runner: {} as Adapters['tools']['runner'],
        profile: 'haiku',
        cwd: '/tmp',
        agentTools: {},
      },
      store,
      observer: { start: vi.fn(), update: vi.fn(), complete: vi.fn() },
      config: state.config,
      controls: [],
    }

    const result = await handleReorderPhases({ type: 'reorder-phases' }, state, adapters)

    expect(result).toHaveProperty('phases')
    expect(result).toHaveProperty('remainingTasks')
    expect(result).toHaveProperty('completedTasks')
  })
})
