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
  `eval-investigate-vagueness-${Date.now()}.json`,
)

const flagsFixture = fixtures.vagueness.find(
  (f) => f.name === 'flags-vague-steps',
)!

const phase: PhaseState = {
  title: 'API rate limiting',
  brief: flagsFixture.phase?.brief ?? '',
  controls: {
    vagueness: {
      dismissed: [],
      raised: [
        {
          path: 'Configure the limits appropriately',
          reason: 'no specific values given',
        },
        {
          path: 'Handle errors in a reasonable way',
          reason: 'no specific status codes or messages defined',
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
  controls: [defaultControls.find((c) => c.name === 'vagueness')!],
}

console.log(`investigate-phase-vagueness — profile: ${profileName}`)
console.log()

const result = await handleInvestigatePhase(
  { type: 'investigate-phase', phase: 0 },
  state,
  adapters,
)
const vagueness = result.phases[0].controls.vagueness

console.log(`Raised after investigation: ${vagueness?.raised.length ?? 0}`)
console.log(
  `Dismissed after investigation: ${vagueness?.dismissed.length ?? 0}`,
)
if (vagueness?.dismissed.length) {
  vagueness.dismissed.forEach((d) =>
    console.log(`  Dismissed: ${d.path} — ${d.reason}`),
  )
}
