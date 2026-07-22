import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleInvestigatePhase } from '../../src/tasks/investigate-phase.ts'
import { defaultControls } from '../../src/index.ts'
import type { PlanState, PhaseState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile, fixtures } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const stateFile = join(
  tmpdir(),
  `eval-investigate-duplication-${Date.now()}.json`,
)

const flagsFixture = fixtures.duplication.find(
  (f) => f.name === 'flags-duplication',
)!

const phase: PhaseState = {
  title: 'User profile page',
  brief: flagsFixture.phase?.brief ?? '',
  controls: {
    duplication: {
      dismissed: [],
      raised: [
        {
          path: 'src/middleware/auth.ts — implement JWT verification middleware for all protected routes',
          reason:
            'cross-cutting system-wide work, belongs in a dedicated auth phase',
        },
      ],
    },
  },
  iterations: 1,
}

const state: PlanState = {
  brief: 'test brief',
  recon: '',
  startedAt: Date.now(),
  completedAt: null,
  currentTask: null,
  progressHandle: null,
  phases: [phase],
  remainingTasks: [],
  completedTasks: [],
  awaitingQuestions: [],
  answeredQuestions: [],
  pendingQuestions: [],
}

let stored = state

const adapters: Adapters = {
  tools: { runner, profile: profileName, cwd: process.cwd(), tools: [] },
  store: {
    read: () => stored,
    write: (s) => {
      stored = s
      writeFileSync(stateFile, JSON.stringify(s))
    },
  },
  observer: {
    start: async () => null,
    update: async () => {},
    complete: async () => {},
  },
  config: { maxFilesPerPhase: 10, minIterations: 1, maxIterations: 5 },
  controls: [defaultControls.find((c) => c.name === 'duplication')!],
}

console.log(`investigate-phase-duplication — profile: ${profileName}`)
console.log()

const result = await handleInvestigatePhase(
  { type: 'investigate-phase', phase: 0 },
  state,
  adapters,
)
const duplication = result.phases[0].controls.duplication

console.log(`Raised after investigation: ${duplication?.raised.length ?? 0}`)
console.log(
  `Dismissed after investigation: ${duplication?.dismissed.length ?? 0}`,
)
if (duplication?.dismissed.length) {
  duplication.dismissed.forEach((d) =>
    console.log(`  Dismissed: ${d.path} — ${d.reason}`),
  )
}
