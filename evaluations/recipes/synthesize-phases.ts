import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleSynthesizePhases } from '../../src/tasks/synthesize-phases.ts'
import type { PlanState, Adapters } from '../../src/index.ts'
import { runner, defaultProfile, prompts } from '../config.ts'

const profileName = defaultProfile
if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const stateFile = join(tmpdir(), `eval-synthesize-phases-${Date.now()}.json`)

const state: PlanState = {
  brief: prompts.tiny,
  recon: '',
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

console.log(`synthesize-phases — profile: ${profileName}`)
console.log('Brief:', prompts.tiny)
console.log()

const result = await handleSynthesizePhases({ type: 'synthesize-phases' }, state, adapters)

console.log(`Phases produced: ${result.phases.length}`)
for (let i = 0; i < result.phases.length; i++) {
  console.log(`  Phase ${i + 1}: ${result.phases[i].title}`)
}
