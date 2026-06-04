import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handlePlanPhase } from '../../src/tasks/plan-phase.ts'
import type { PlanState, PhaseState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const stateFile = join(tmpdir(), `eval-plan-phase-${Date.now()}.json`)

const phase: PhaseState = {
  title: 'Rate limiting middleware',
  brief: 'Add rate limiting to the public API endpoints.',
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
  observer: { start: async () => null, update: async () => {}, complete: async () => {} },
  config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 2 },
  controls: [],
}

console.log(`plan-phase — profile: ${profileName}`)
console.log('Phase:', phase.title)
console.log()

const result = await handlePlanPhase({ type: 'plan-phase', phase: 0 }, state, adapters)

console.log('Planned brief:')
console.log(result.phases[0].brief)
