import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleCheckPhase } from '../../src/tasks/check-phase.ts'
import { defaultControls } from '../../src/index.ts'
import type { PlanState, PhaseState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile, fixtures } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured')
  process.exit(1)
}

function makeAdapters(state: PlanState): Adapters {
  let stored = state
  return {
    tools: { runner, profile: profileName, cwd: process.cwd(), tools: [] },
    store: {
      read: () => stored,
      write: (s) => {
        stored = s
      },
    },
    observer: {
      start: async () => null,
      update: async () => {},
      complete: async () => {},
    },
    config: {
      maxFilesPerPhase: 10,
      minimumIterations: 1,
      maximumIterations: 5,
    },
    controls: [defaultControls.find((c) => c.name === 'duplication')!],
  }
}

function makeState(
  phase: Partial<PhaseState>,
  controlState = { dismissed: [], raised: [] },
): PlanState {
  return {
    brief: 'test brief',
    recon: '',
    startedAt: Date.now(),
    completedAt: null,
    currentTask: null,
    progressHandle: null,
    phases: [
      {
        title: 'Test Phase',
        brief: '',
        controls: { duplication: controlState },
        iterations: 0,
        ...phase,
      },
    ],
    remainingTasks: [],
    completedTasks: [],
    awaitingQuestions: [],
    answeredQuestions: [],
    pendingQuestions: [],
  }
}

console.log(`check-phase-duplication — profile: ${profileName}`)
console.log()

for (const fixture of fixtures.duplication) {
  const state = makeState(fixture.phase ?? {}, {
    dismissed: (fixture.control?.dismissed ?? []) as any,
    raised: [],
  })
  const adapters = makeAdapters(state)
  const result = await handleCheckPhase(
    { type: 'check-phase', phase: 0 },
    state,
    adapters,
  )
  const raised = result.phases[0]?.controls?.duplication?.raised ?? []

  console.log(`Fixture: ${fixture.name}`)
  console.log(`Expected: ${fixture.expected}`)
  console.log(`Actual raised (${raised.length}):`)
  if (raised.length === 0) console.log('  (clean)')
  else raised.forEach((f: any) => console.log(`  - ${f.path}: ${f.reason}`))
  console.log()
}
