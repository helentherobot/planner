import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { handlePlanPhase } from '../../src/tasks/plan-phase.ts'
import type { PlanState, PhaseState, Adapters } from '../../src/index.ts'
import { makeDiscoverable } from '../../src/tools/helpers.ts'
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

const cwd = process.cwd()

const fileTools = [
  makeDiscoverable(
    'read_file',
    'Read the contents of a file in the codebase.',
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or cwd-relative path' },
      },
      required: ['path'],
    },
    async ({ path }) => {
      try {
        return readFileSync(resolve(cwd, path as string), 'utf8')
      } catch (e) {
        return `Error: ${e}`
      }
    },
  ),
  makeDiscoverable(
    'list_directory',
    'List files and directories inside a path.',
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or cwd-relative path' },
      },
      required: ['path'],
    },
    async ({ path }) => {
      try {
        const dir = resolve(cwd, path as string)
        return readdirSync(dir)
          .map((f) => {
            const full = join(dir, f)
            return statSync(full).isDirectory() ? `${f}/` : f
          })
          .join('\n')
      } catch (e) {
        return `Error: ${e}`
      }
    },
  ),
]

const adapters: Adapters = {
  tools: {
    runner,
    profile: profileName,
    cwd,
    tools: [],
    taskTools: { 'plan-phase': fileTools },
  },
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

console.log(`plan-phase — profile: ${profileName}`)
console.log('Phase:', phase.title)
console.log()

const result = await handlePlanPhase(
  { type: 'plan-phase', phase: 0 },
  state,
  adapters,
)

console.log('Planned brief:')
console.log(result.phases[0].brief)
