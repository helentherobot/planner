import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { run, defaultControls, createInitialState } from '../../src/index.ts'
import type {
  Store,
  Observer,
  PlanState,
  ProgressEvent,
  Adapters,
} from '../../src/index.ts'
import {
  runner,
  profileNames as availableProfiles,
  prompts,
} from '../config.ts'

function parseArgs() {
  const args = process.argv.slice(2)
  let size: keyof typeof prompts = 'tiny'
  let selectedProfiles: string[] = []

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--size' && args[i + 1])
      size = args[++i] as keyof typeof prompts
    if (args[i] === '--profiles' && args[i + 1])
      selectedProfiles = args[++i].split(',')
  }

  return { size, profileNames: selectedProfiles }
}

const { size, profileNames } = parseArgs()

if (profileNames.length < 2) {
  console.error(
    'Usage: tsx evaluations/e2e/compare-profiles.ts --size small --profiles p1,p2',
  )
  process.exit(1)
}

for (const name of profileNames) {
  if (!availableProfiles.includes(name)) {
    console.error(`Profile "${name}" not found in evaluations/config.ts`)
    process.exit(1)
  }
}

if (!prompts[size]) {
  console.error(
    `Unknown size "${size}". Valid: tiny, small, medium, large, huge`,
  )
  process.exit(1)
}

const brief = prompts[size]

console.log(`Profile comparison`)
console.log(`  Size: ${size}`)
console.log(`  Profiles: ${profileNames.join(', ')}`)
console.log()

async function runProfile(
  profileName: string,
): Promise<{ phases: PlanState['phases']; elapsedMs: number }> {
  const stateDir = mkdtempSync(join(tmpdir(), `planner-cmp-${profileName}-`))
  const stateFile = join(stateDir, 'state.json')

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

  const taskLog: string[] = []

  const observer: Observer<number> = {
    async start(): Promise<number> {
      return Date.now()
    },
    async update(handle: number, event: ProgressEvent): Promise<void> {
      const task = event.currentTask
      if (task) {
        const label = `${task.type}${task.phase !== undefined ? ` (phase ${task.phase})` : ''}`
        taskLog.push(label)
        process.stdout.write(`  [${profileName}] ${label}\n`)
      }
    },
    async complete(): Promise<void> {},
  }

  const adapters: Adapters = {
    tools: {
      runner,
      profile: profileName,
      cwd: process.cwd(),
      tools: [],
    },
    store,
    observer,
    config: {
      maxFilesPerPhase: 12,
      minIterations: 1,
      maxIterations: 5,
    },
    controls: defaultControls,
  }

  const startedAt = Date.now()
  const result = await run(createInitialState(brief), adapters)

  if (result.status === 'needs-answers') {
    console.error(
      `[${profileName}] Paused — needs answers. Cannot compare profiles in this state.`,
    )
    process.exit(1)
  }

  return { phases: result.state.phases, elapsedMs: Date.now() - startedAt }
}

const results: Record<
  string,
  { phases: PlanState['phases']; elapsedMs: number }
> = {}

for (const name of profileNames) {
  console.log(`Running profile: ${name}`)
  results[name] = await runProfile(name)
  console.log()
}

console.log('='.repeat(60))
console.log('COMPARISON')
console.log('='.repeat(60))
console.log()

const maxPhases = Math.max(...profileNames.map((n) => results[n].phases.length))

for (let i = 0; i < maxPhases; i++) {
  console.log(`Phase ${i + 1}:`)
  for (const name of profileNames) {
    const phase = results[name].phases[i]
    console.log(`  [${name}] ${phase ? phase.title : '(no phase)'}`)
  }
  console.log()
}

console.log('Phase counts:')
for (const name of profileNames) {
  const elapsed = Math.round(results[name].elapsedMs / 1000)
  console.log(
    `  [${name}] ${results[name].phases.length} phases in ${elapsed}s`,
  )
}
