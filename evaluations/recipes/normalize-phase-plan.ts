import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleNormalizePhasePlan } from '../../src/tasks/normalize-phase-plan.ts'
import type { PlanState, PhaseState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const stateFile = join(tmpdir(), `eval-normalize-phase-plan-${Date.now()}.json`)

const phase: PhaseState = {
  title: 'Rate limiting middleware',
  brief: `here's what we need to do for rate limiting:

- add the express-rate-limit package. it should be 100 req/min per IP
- there's an env var for this (RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS)
- if someone hits the limit send 429 back with Retry-After
- probably put the middleware in src/middleware somewhere
- tests too I guess`,
  controls: {},
  iterations: 0,
}

const state: PlanState = {
  brief: 'Add rate limiting to the API.',
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
  config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 2 },
  controls: [],
}

console.log(`normalize-phase-plan — profile: ${profileName}`)
console.log()

const result = await handleNormalizePhasePlan(
  { type: 'normalize-phase-plan', phase: 0 },
  state,
  adapters,
)

console.log('Normalised plan:')
console.log(result.phases[0].brief)
