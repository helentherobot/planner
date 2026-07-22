import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleRevisePhase } from '../../src/tasks/revise-phase.ts'
import type { PlanState, PhaseState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const stateFile = join(tmpdir(), `eval-revise-phase-${Date.now()}.json`)

const phase: PhaseState = {
  title: 'Rate limiting middleware',
  brief: `Implement rate limiting for the public API.

Steps:
- Set up rate limiting middleware somewhere in the middleware folder
- Configure the limits as needed
- Handle errors appropriately
- Write tests`,
  controls: {
    vagueness: {
      raised: [
        {
          path: 'somewhere in the middleware folder',
          reason: 'no specific file path given',
        },
        {
          path: 'Configure the limits as needed',
          reason: 'no specific values given',
        },
      ],
      dismissed: [],
    },
  },
  iterations: 1,
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
  config: { maxFilesPerPhase: 10, minIterations: 1, maxIterations: 2 },
  controls: [],
}

console.log(`revise-phase — profile: ${profileName}`)
console.log()

const result = await handleRevisePhase(
  { type: 'revise-phase', phase: 0 },
  state,
  adapters,
)

console.log('Revised brief:')
console.log(result.phases[0].brief)
