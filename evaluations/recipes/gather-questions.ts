import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleGatherQuestions } from '../../src/tasks/gather-questions.ts'
import type { PlanState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile, prompts } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const stateFile = join(tmpdir(), `eval-gather-questions-${Date.now()}.json`)

const state: PlanState = {
  brief: prompts.small,
  recon: `
src/
  models/
    user.ts — User model (id, email, name, createdAt)
    session.ts — Session model
  routes/
    auth.ts — POST /auth/login, POST /auth/logout
    users.ts — GET /users/:id
  services/
    email.ts — stub, no provider wired up yet
  db/
    schema.ts — sqlite schema definitions
  app.ts — Express app setup
tests/
  models/user.test.ts
  routes/auth.test.ts
  `.trim(),
  startedAt: Date.now(),
  completedAt: null,
  currentTask: null,
  progressHandle: null,
  phases: [],
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

console.log(`gather-questions — profile: ${profileName}`)
console.log('Brief:', prompts.small)
console.log()

const result = await handleGatherQuestions({ type: 'gather-questions' }, state, adapters)

if (result.awaitingQuestions.length === 0) {
  console.log('No structural questions — planning can proceed.')
} else {
  console.log(`Structural questions (${result.awaitingQuestions.length}):`)
  for (const q of result.awaitingQuestions) {
    console.log(`  [${q.id}] ${q.question}`)
    if (q.context) console.log(`       Context: ${q.context}`)
  }
}
