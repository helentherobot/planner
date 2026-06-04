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

const stateFile = join(tmpdir(), `eval-investigate-scope-${Date.now()}.json`)

const flagsFixture = fixtures.scope.find((f) => f.name === 'flags-out-of-scope-files')!

const phase: PhaseState = {
  title: 'Add user avatar upload',
  brief: flagsFixture.phase?.brief ?? '',
  index: flagsFixture.phase?.index,
  controls: {
    scope: {
      dismissed: [],
      raised: [
        {
          path: 'src/middleware/auth.ts',
          reason: 'not listed in the authorised file index for this phase',
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
  observer: { start: async () => null, update: async () => {}, complete: async () => {} },
  config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 5 },
  controls: [defaultControls.find((c) => c.name === 'scope')!],
}

console.log(`investigate-phase-scope — profile: ${profileName}`)
console.log()

const result = await handleInvestigatePhase(
  { type: 'investigate-phase', phase: 0 },
  state,
  adapters,
)
const scope = result.phases[0].controls.scope

console.log(`Raised after investigation: ${scope?.raised.length ?? 0}`)
console.log(`Dismissed after investigation: ${scope?.dismissed.length ?? 0}`)
if (scope?.dismissed.length) {
  scope.dismissed.forEach((d) => console.log(`  Dismissed: ${d.path} — ${d.reason}`))
}
