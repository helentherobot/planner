import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleGatherPhaseQuestions } from '../../src/tasks/gather-phase-questions.ts'
import type { PlanState, PhaseState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile, prompts } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const stateFile = join(tmpdir(), `eval-gather-phase-questions-${Date.now()}.json`)

const phase: PhaseState = {
  title: 'Notification delivery and email digest',
  brief: `Set up the notification delivery pipeline and email digest system.

- Write notifications to the database when events occur
- Send email digests to users who have opted in
- Schedule the digest job to run periodically
- Handle errors appropriately`,
  controls: {},
  iterations: 0,
}

const state: PlanState = {
  brief: prompts.small,
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

console.log(`gather-phase-questions — profile: ${profileName}`)
console.log('Phase:', phase.title)
console.log()

const result = await handleGatherPhaseQuestions(
  { type: 'gather-phase-questions', phase: 0 },
  state,
  adapters,
)

if (result.pendingQuestions.length === 0) {
  console.log('No phase questions surfaced.')
} else {
  console.log(`Pending questions (${result.pendingQuestions.length}):`)
  for (const q of result.pendingQuestions) {
    const phases = Array.isArray(q.phaseIndex) ? q.phaseIndex.join(', ') : q.phaseIndex
    console.log(`  [${q.id}] Phase ${phases}: ${q.question}`)
    if (q.context) console.log(`       Context: ${q.context}`)
  }
}
