import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { run, defaultControls, createInitialState } from '../../src/index.ts'
import type {
  Store,
  Observer,
  PlanState,
  ProgressEvent,
  Adapters,
} from '../../src/index.ts'
import { makeDiscoverable } from '../../src/tools/helpers.ts'
import { runner, profileNames, defaultProfile, prompts } from '../config.ts'

function parseArgs() {
  const args = process.argv.slice(2)
  let size: keyof typeof prompts = 'tiny'
  let min = 1
  let max = 2
  let profileName = ''
  const answers: Array<{ questionId: string; answer: string }> = []

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--size' && args[i + 1])
      size = args[++i] as keyof typeof prompts
    if (args[i] === '--min' && args[i + 1]) min = parseInt(args[++i], 10)
    if (args[i] === '--max' && args[i + 1]) max = parseInt(args[++i], 10)
    if (args[i] === '--profile' && args[i + 1]) profileName = args[++i]
    if (args[i] === '--answer' && args[i + 1] && args[i + 2]) {
      answers.push({ questionId: args[++i], answer: args[++i] })
    }
  }

  return { size, min, max, profileName, answers }
}

const { size, min, max, profileName: rawProfile, answers } = parseArgs()

const profileName = rawProfile || defaultProfile

if (!profileName || !profileNames.includes(profileName)) {
  console.error(
    `Profile "${profileName}" not found. Available: ${profileNames.join(', ') || '(none — configure evaluations/config.ts)'}`,
  )
  process.exit(1)
}

if (!prompts[size]) {
  console.error(
    `Unknown size "${size}". Valid: ${Object.keys(prompts).join(', ')}`,
  )
  process.exit(1)
}

const stateDir = resolve(import.meta.dirname, '../../.eval-state')
mkdirSync(stateDir, { recursive: true })
const stateFile = join(stateDir, 'state.json')

console.log(`E2E plan evaluation`)
console.log(`  Size: ${size}`)
console.log(`  Profile: ${profileName}`)
console.log(`  Iterations: min=${min} max=${max}`)
console.log(`  State: ${stateFile}`)
if (answers.length > 0) {
  console.log(`  Answers:`)
  for (const a of answers) console.log(`    [${a.questionId}] ${a.answer}`)
}
console.log()

const store: Store = {
  read(): PlanState | null {
    try {
      return JSON.parse(readFileSync(stateFile, 'utf8'))
    } catch {
      return null
    }
  },
  write(state: PlanState): void {
    writeFileSync(stateFile, JSON.stringify(state, null, 2))
  },
}

const observer: Observer<number> = {
  async start(event: ProgressEvent): Promise<number> {
    console.log(`Plan started`)
    return Date.now()
  },
  async update(handle: number, event: ProgressEvent): Promise<void> {
    const done = event.completedTasks.length
    const total = event.totalTasks
    const task = event.currentTask
    const label = task
      ? `${task.type}${task.phase !== undefined ? ` (phase ${task.phase})` : ''}`
      : 'idle'
    const elapsed = Math.round((Date.now() - handle) / 1000)
    console.log(`  [${done}/${total}] ${label} — ${elapsed}s elapsed`)
  },
  async complete(handle: number, event: ProgressEvent): Promise<void> {
    const elapsed = Math.round((Date.now() - handle) / 1000)
    console.log(`Plan complete in ${elapsed}s`)
  },
}

const cwd = process.cwd()

const fileTools = [
  makeDiscoverable(
    'read_file',
    'Read the contents of a file in the codebase.',
    {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or cwd-relative file path',
        },
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
        path: {
          type: 'string',
          description: 'Absolute or cwd-relative directory path',
        },
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
    tools: [fileTools[1]], // list_directory for all agent tasks
    taskTools: {
      'gather-recon': fileTools,
      'plan-phase': fileTools,
      'check-phase': fileTools,
      'investigate-phase': fileTools,
      'revise-phase': fileTools,
    },
  },
  store,
  observer,
  config: {
    maxFilesPerPhase: 6,
    minimumIterations: min,
    maximumIterations: max,
  },
  controls: defaultControls,
}

const brief = prompts[size]

let state = store.read() ?? createInitialState(brief)
let result = await run(
  state,
  adapters,
  answers.length > 0 ? { answers } : undefined,
)

while (result.status === 'needs-answers') {
  console.log()
  console.log(`Paused — structural questions (${result.questions.length}):`)
  for (const q of result.questions) {
    console.log(`  [${q.id}] ${q.question}`)
    if (q.context) console.log(`       Context: ${q.context}`)
  }
  console.log()
  console.log(`Re-run with --answer flags to resume, e.g.:`)
  const flags = result.questions
    .map((q) => `--answer ${q.id} "your answer"`)
    .join(' ')
  console.log(`  tsx evaluations/e2e/plan.ts --size ${size} ${flags}`)
  process.exit(0)
}

const finalState = result.state

console.log()
console.log(`Phases produced: ${finalState.phases.length}`)
for (let i = 0; i < finalState.phases.length; i++) {
  console.log(`  Phase ${i + 1}: ${finalState.phases[i].title}`)
}

if (finalState.pendingQuestions.length > 0) {
  console.log()
  console.log(`Pending questions (${finalState.pendingQuestions.length}):`)
  for (const q of finalState.pendingQuestions) {
    const phases = Array.isArray(q.phaseIndex)
      ? q.phaseIndex.join(', ')
      : q.phaseIndex
    console.log(`  [${q.id}] Phase ${phases}: ${q.question}`)
    if (q.context) console.log(`       Context: ${q.context}`)
  }
}
