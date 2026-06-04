import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleResolvePhaseQuestions } from '../../src/tasks/resolve-phase-questions.ts'
import type { PlanState, PhaseState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile, prompts } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const stateFile = join(
  tmpdir(),
  `eval-resolve-phase-questions-${Date.now()}.json`,
)

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
  pendingQuestions: [
    {
      id: 'q1',
      phaseIndex: 0,
      question: 'What test framework does this project use?',
      context:
        'Needed to determine how to write tests for the notification task.',
    },
    {
      id: 'q2',
      phaseIndex: 0,
      question:
        'What is the name of the npm package published by this project?',
      context: 'Needed to understand how the package is distributed.',
    },
    {
      id: 'q3',
      phaseIndex: 0,
      question: 'Does this project use TypeScript path aliases?',
      context: 'Needed to decide how to structure imports in new files.',
    },
  ],
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

console.log(`resolve-phase-questions — profile: ${profileName}`)
console.log('Phase:', phase.title)
console.log(`Pending questions: ${state.pendingQuestions.length}`)
console.log()

let totalInputTokens = 0
let totalOutputTokens = 0
let totalCostUsd = 0

const trackingAdapters: Adapters = {
  ...adapters,
  onUsage: (event) => {
    totalInputTokens += event.inputTokens
    totalOutputTokens += event.outputTokens
    totalCostUsd += event.totalCostUsd ?? 0
  },
}

const result = await handleResolvePhaseQuestions(
  { type: 'resolve-phase-questions', phase: 0 },
  state,
  trackingAdapters,
)

const originalIds = new Set(state.pendingQuestions.map((q) => q.id))
const answeredIds = new Set(result.answeredQuestions.map((q) => q.id))
const remainingPendingIds = new Set(result.pendingQuestions.map((q) => q.id))

const answered = result.answeredQuestions.filter((q) => originalIds.has(q.id))
const enriched = result.pendingQuestions.filter(
  (q) =>
    originalIds.has(q.id) &&
    q.context !== state.pendingQuestions.find((p) => p.id === q.id)?.context,
)
const untouched = state.pendingQuestions.filter(
  (q) => remainingPendingIds.has(q.id) && !enriched.some((e) => e.id === q.id),
)

if (answered.length > 0) {
  console.log(`Answered (${answered.length}):`)
  for (const q of answered) {
    console.log(`  [${q.id}] ${q.question}`)
    console.log(`       Answer: ${q.answer}`)
  }
  console.log()
}

if (enriched.length > 0) {
  console.log(`Enriched (${enriched.length}):`)
  for (const q of enriched) {
    console.log(`  [${q.id}] ${q.question}`)
    console.log(`       Context: ${q.context}`)
  }
  console.log()
}

if (untouched.length > 0) {
  console.log(`Untouched (${untouched.length}):`)
  for (const q of untouched) {
    console.log(`  [${q.id}] ${q.question}`)
  }
  console.log()
}

console.log('Usage:')
console.log(`  Input tokens:  ${totalInputTokens}`)
console.log(`  Output tokens: ${totalOutputTokens}`)
console.log(`  Cost (USD):    $${totalCostUsd.toFixed(6)}`)
