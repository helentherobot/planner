import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { run, defaultControls, createInitialState } from '@/index.ts'
import type { Store, Observer, PlanState, ProgressEvent, Adapters } from '@/index.ts'
import { makeDiscoverable } from '@/tools/helpers.ts'
import { runner, profileNames, defaultProfile, prompts } from '../config.ts'

function parseArgs() {
  const args = process.argv.slice(2)
  let size: keyof typeof prompts = 'tiny'
  let min = 1
  let max = 2
  let profileName = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--size' && args[i + 1]) size = args[++i] as keyof typeof prompts
    if (args[i] === '--min' && args[i + 1]) min = parseInt(args[++i], 10)
    if (args[i] === '--max' && args[i + 1]) max = parseInt(args[++i], 10)
    if (args[i] === '--profile' && args[i + 1]) profileName = args[++i]
  }

  return { size, min, max, profileName }
}

const { size, min, max, profileName: rawProfile } = parseArgs()

const profileName = rawProfile || defaultProfile

if (!profileName || !profileNames.includes(profileName)) {
  console.error(
    `Profile "${profileName}" not found. Available: ${profileNames.join(', ') || '(none — configure evaluations/config.ts)'}`,
  )
  process.exit(1)
}

if (!prompts[size]) {
  console.error(`Unknown size "${size}". Valid: ${Object.keys(prompts).join(', ')}`)
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
      properties: { path: { type: 'string', description: 'Absolute or cwd-relative file path' } },
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
        path: { type: 'string', description: 'Absolute or cwd-relative directory path' },
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
    maxFilesPerPhase: 20,
    minimumIterations: min,
    maximumIterations: max,
  },
  controls: defaultControls,
}

const brief = prompts[size]

const finalState = await run(createInitialState(brief), adapters)

console.log()
console.log(`Phases produced: ${finalState.phases.length}`)
for (let i = 0; i < finalState.phases.length; i++) {
  console.log(`  Phase ${i + 1}: ${finalState.phases[i].title}`)
}
