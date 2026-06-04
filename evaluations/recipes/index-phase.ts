import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleIndexPhase } from '../../src/tasks/index-phase.ts'
import type { PlanState, PhaseState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const stateFile = join(tmpdir(), `eval-index-phase-${Date.now()}.json`)

const phase: PhaseState = {
  title: 'Rate limiting middleware',
  brief: `Implement rate limiting for the public API.

**Files to create or modify:**

- \`src/middleware/rateLimiter.ts\` — Create the rate limiting middleware using \`express-rate-limit\`. Configure 100 requests per minute per IP address using \`RATE_LIMIT_MAX\` and \`RATE_LIMIT_WINDOW_MS\` environment variables with sensible defaults.
- \`src/app.ts\` — Apply the rate limiter middleware to all \`/api\` routes before the route handlers.
- \`tests/middleware/rateLimiter.test.ts\` — Unit tests covering the middleware configuration and the 429 response with \`Retry-After\` header.`,
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

console.log(`index-phase — profile: ${profileName}`)
console.log()

const result = await handleIndexPhase(
  { type: 'index-phase', phase: 0 },
  state,
  adapters,
)

console.log('File index:')
console.log(result.phases[0].index ?? '(none)')
