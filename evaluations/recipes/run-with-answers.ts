import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run, defaultControls } from '../../src/index.ts'
import type { PlanState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile, prompts } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const stateFile = join(tmpdir(), `eval-run-with-answers-${Date.now()}.json`)

// Simulate a state that was paused at gather-questions.
// awaitingQuestions is populated; remainingTasks picks up from synthesize-phases.
const state: PlanState = {
  brief: prompts.small,
  recon: '',
  startedAt: Date.now(),
  completedAt: null,
  currentTask: null,
  progressHandle: null,
  phases: [],
  remainingTasks: [{ type: 'synthesize-phases' }],
  completedTasks: [{ type: 'gather-recon' }, { type: 'gather-questions' }],
  awaitingQuestions: [
    {
      id: 'recon-0',
      question:
        'Will a message queue be used, or will notifications be written directly to the database?',
      context:
        'This determines whether a queue infrastructure phase is needed.',
    },
    {
      id: 'recon-1',
      question:
        'Are real-time push notifications required, or will polling suffice?',
      context: 'Real-time push requires a dedicated infrastructure phase.',
    },
  ],
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
    async start() {
      console.log('Plan resumed')
      return Date.now()
    },
    async update(handle, event) {
      const task = event.currentTask
      const label = task
        ? `${task.type}${task.phase !== undefined ? ` (phase ${task.phase})` : ''}`
        : 'idle'
      const elapsed = Math.round((Date.now() - handle) / 1000)
      console.log(
        `  [${event.completedTasks.length}/${event.totalTasks}] ${label} — ${elapsed}s elapsed`,
      )
    },
    async complete(handle) {
      const elapsed = Math.round((Date.now() - handle) / 1000)
      console.log(`Plan complete in ${elapsed}s`)
    },
  },
  config: { maxFilesPerPhase: 10, minimumIterations: 1, maximumIterations: 2 },
  controls: defaultControls,
}

const answers = [
  {
    questionId: 'recon-0',
    answer: 'Direct database writes — no queue needed for now.',
  },
  {
    questionId: 'recon-1',
    answer: 'Polling is fine — no real-time push required.',
  },
]

console.log(`run-with-answers — profile: ${profileName}`)
console.log('Brief:', prompts.small)
console.log()
console.log('Answering structural questions:')
for (const a of answers) console.log(`  [${a.questionId}] ${a.answer}`)
console.log()

const result = await run(state, adapters, { answers })

if (result.status === 'needs-answers') {
  console.error(
    'Unexpected needs-answers after providing answers — check awaitingQuestions IDs match.',
  )
  process.exit(1)
}

const final = result.state

console.log()
console.log(`answeredQuestions (${final.answeredQuestions.length}):`)
for (const q of final.answeredQuestions) {
  console.log(`  [${q.id}] Q: ${q.question}`)
  console.log(`        A: ${q.answer}`)
}

console.log()
console.log(`Phases produced: ${final.phases.length}`)
for (let i = 0; i < final.phases.length; i++) {
  console.log(`  Phase ${i + 1}: ${final.phases[i].title}`)
}

if (final.pendingQuestions.length > 0) {
  console.log()
  console.log(`Pending questions (${final.pendingQuestions.length}):`)
  for (const q of final.pendingQuestions) {
    const phases = Array.isArray(q.phaseIndex)
      ? q.phaseIndex.join(', ')
      : q.phaseIndex
    console.log(`  [${q.id}] Phase ${phases}: ${q.question}`)
  }
}
