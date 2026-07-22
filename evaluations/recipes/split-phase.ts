import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleSplitPhase } from '../../src/tasks/split-phase.ts'
import type { PlanState, PhaseState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const stateFile = join(tmpdir(), `eval-split-phase-${Date.now()}.json`)

const phase: PhaseState = {
  title: 'Full authentication system',
  brief: `Implement the complete authentication system.

Files:
- \`src/models/user.ts\` — User model with name, email, passwordHash, role
- \`src/models/session.ts\` — Session model with token, userId, expiresAt
- \`src/models/refreshToken.ts\` — Refresh token model
- \`migrations/001_create_users.sql\`
- \`migrations/002_create_sessions.sql\`
- \`migrations/003_create_refresh_tokens.sql\`
- \`src/services/auth.ts\` — login, logout, refresh, validate
- \`src/services/password.ts\` — bcrypt hash and compare helpers
- \`src/services/token.ts\` — JWT sign and verify
- \`src/middleware/auth.ts\` — authenticate middleware
- \`src/routes/auth.ts\` — POST /auth/login, POST /auth/logout, POST /auth/refresh
- \`src/routes/me.ts\` — GET /me
- \`tests/services/auth.test.ts\`
- \`tests/services/password.test.ts\`
- \`tests/services/token.test.ts\`
- \`tests/middleware/auth.test.ts\``,
  index: [
    'src/models/user.ts',
    'src/models/session.ts',
    'src/models/refreshToken.ts',
    'migrations/001_create_users.sql',
    'migrations/002_create_sessions.sql',
    'migrations/003_create_refresh_tokens.sql',
    'src/services/auth.ts',
    'src/services/password.ts',
    'src/services/token.ts',
    'src/middleware/auth.ts',
    'src/routes/auth.ts',
    'src/routes/me.ts',
    'tests/services/auth.test.ts',
    'tests/services/password.test.ts',
    'tests/services/token.test.ts',
    'tests/middleware/auth.test.ts',
  ].join('\n'),
  controls: {},
  iterations: 0,
}

const state: PlanState = {
  brief: 'Build a full authentication system.',
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
  config: { maxFilesPerPhase: 8, minIterations: 1, maxIterations: 2 },
  controls: [],
}

console.log(`split-phase — profile: ${profileName}`)
console.log(`Max files: ${adapters.config.maxFilesPerPhase}`)
console.log()

const result = await handleSplitPhase(
  { type: 'split-phase', phase: 0 },
  state,
  adapters,
)

console.log(`Phases after split: ${result.phases.length}`)
for (let i = 0; i < result.phases.length; i++) {
  console.log(`  Phase ${i + 1}: ${result.phases[i].title}`)
}
