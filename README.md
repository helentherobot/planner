# @helentherobot/planner

`@helentherobot/planner` is the orchestration core for building phased implementation plans from a project brief. It accepts an `Adapters` bundle (persistence, progress reporting, AI execution, quality controls) and returns a serialisable `PlanState`. The package owns all orchestration logic — task sequencing, quality check loops, phase splitting, and plan revision — and has no dependency on any host application.

## Installation

```
npm install @helentherobot/planner
```

`@helentherobot/runner` is a peer dependency — install it separately if you need to import from it directly (e.g. to construct a `Runner` instance or reference `RunnerConfig`):

```
npm install @helentherobot/runner
```

## Concepts

- **`PlanState`** — the full serialisable state of a plan run: the brief, all phases, the task queue, timestamps, and the current progress handle.
- **`Adapters`** — the bundle the consumer provides: AI tools, persistence, progress reporting, configuration, and quality controls.
- **`Store`** — a persistence adapter with `read()` and `write()` methods, bound by the consumer to a specific location.
- **`Observer`** — a progress reporting adapter that receives start, update, and complete events and returns an opaque handle used to track a single reporting resource (e.g. a Telegram message).
- **`Tools`** — the AI execution adapter: a `Runner` instance, a default profile name, the project `cwd`, and the agent tools to expose. Per-task tool sets can be supplied via `taskTools`.
- **`QualityControl`** — a named concern (vagueness, duplication, scope) with a `checkRecipe` that scans a phase and returns findings, and an `investigateRecipe` that confirms or dismisses each one by number.
- **`ControlFinding`** — a structured finding: `{ path: string, reason: string }`. Both `raised` and `dismissed` lists use this type.

## Implementing `Store`

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import type { Store, PlanState } from '@helentherobot/planner'

const stateFile = '/path/to/feature/.plan-state.json'

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
```

## Implementing `Observer`

`Observer<THandle>` is generic. Whatever value `start` returns becomes the `handle` passed to every subsequent `update` and `complete` call. Use it to track any resource that persists across the run — a message ID, a timestamp, a database row.

```ts
import type { Observer, ProgressEvent } from '@helentherobot/planner'

const observer: Observer<number> = {
  async start(event: ProgressEvent): Promise<number> {
    console.log(`Starting plan: ${event.brief.slice(0, 60)}...`)
    return Date.now() // this value is passed as `handle` to update() and complete()
  },
  async update(handle: number, event: ProgressEvent): Promise<void> {
    const done = event.completedTasks.length
    const total = event.totalTasks
    console.log(`[${done}/${total}] ${event.currentTask?.type ?? 'idle'}`)
  },
  async complete(handle: number, event: ProgressEvent): Promise<void> {
    console.log(`Plan complete after ${Date.now() - handle}ms`)
  },
}
```

## Building `Adapters`

```ts
import { Runner } from '@helentherobot/runner'
import { defaultControls } from '@helentherobot/planner'
import type { Adapters } from '@helentherobot/planner'

const runner = new Runner({
  profiles: {
    sonnet: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      contextWindowTokens: 200000,
      requestTimeoutMs: 120000,
      queue: { maxConcurrent: 2, requestsPerMinute: 50, affinityMode: false, warmup: false },
    },
  },
  secrets: { anthropic: process.env.ANTHROPIC_API_KEY },
})

const adapters: Adapters = {
  tools: {
    runner,
    profile: 'sonnet',
    cwd: '/path/to/project',
    tools: [], // tools available to all tasks
    taskTools: {
      // optional: per-task tool overrides
      'gather-recon': [readFileTool, listDirectoryTool],
      'plan-phase': [readFileTool],
    },
  },
  store,
  observer,
  config: {
    maxFilesPerPhase: 12,
    minimumIterations: 2,
    maximumIterations: 5,
  },
  controls: defaultControls,
}
```

`taskProfiles` is an optional field on `Config` that lets you override the model profile for individual task types. Values can be a string or a function (sync or async), so you can implement fallback logic at runtime:

```ts
config: {
  maxFilesPerPhase: 12,
  minimumIterations: 2,
  maximumIterations: 5,
  taskProfiles: {
    'synthesize-phases': 'opus',
    'check-phase': 'haiku',
    'plan-phase': () => creditsRemaining() > 0 ? 'opus' : 'haiku',
  },
}
```

## Starting a plan

```ts
import { run, createInitialState } from '@helentherobot/planner'

const finalState = await run(
  createInitialState('Add OAuth2 login with GitHub and Google to the existing Express app.'),
  adapters,
)
```

`run()` calls `observer.start()` internally before the first task and `observer.complete()` when done — you don't call them yourself. The `synthesize-phases` task expands into the full task queue automatically. State is written after every task, so an interrupted run can be resumed.

By the time `run()` resolves, the returned state looks something like:

```
PlanState {
  brief: "Add OAuth2 login..."
  recon: "The project uses Express 4, Passport.js is already installed..."
  phases: [
    {
      title: "Database schema",
      brief: "## Files\n- src/db/schema.ts — add users table...\n...",
      index: "src/db/schema.ts\nsrc/db/migrations/...",
      iterations: 2,
      controls: {
        scope: { raised: [], dismissed: [{ path: "src/auth/...", reason: "..." }] },
        ...
      }
    },
    ...
  ]
  completedTasks: [ all tasks that ran ]
  remainingTasks: []
  completedAt: 1735000000000
}
```

## Resuming a plan

```ts
import { run } from '@helentherobot/planner'

const saved = store.read()

if (saved) {
  const finalState = await run(saved, adapters)
}
```

The orchestrator picks up from `remainingTasks[0]` and continues without any additional setup. If the plan was already complete, `run()` returns immediately.

## Cancellation

```ts
import { run } from '@helentherobot/planner'

const controller = new AbortController()

setTimeout(() => controller.abort(), 30_000)

const finalState = await run(state, adapters, controller.signal)
```

`run()` checks the signal before starting each task. Aborting stops the run cleanly after the current task finishes. The saved state can be resumed later.

## Adding a custom `QualityControl`

### `ControlFinding`

Every finding — whether raised or dismissed — is a `ControlFinding`:

```ts
interface ControlFinding {
  path: string // what was flagged: a file path, step text, or item name
  reason: string // why it was flagged or why it was dismissed
}
```

Both `controlState.raised` and `controlState.dismissed` are `ControlFinding[]`.

### Check recipe

Must return `{ "findings": ControlFinding[] }`. An empty array means the phase is clean.

### Investigate recipe

Receives the raised findings numbered `1.`, `2.`, `3.` in the prompt. Must return:

```json
{ "confirmed": [1, 3], "dismissed": [2] }
```

Both arrays contain **issue numbers** — the 1-based positions from the list shown in the prompt. The orchestrator maps them back to the original `ControlFinding` objects. This means multiple findings for the same file or step are handled independently, and the model never needs to repeat or reconstruct finding text.

### Example

```ts
import type { QualityControl } from '@helentherobot/planner'

const consistencyControl: QualityControl = {
  name: 'consistency',
  checkRecipe: {
    profile: '',
    prompt: ({ phaseState, controlState }) => {
      const cleared =
        controlState.dismissed.length > 0
          ? `\nPreviously cleared — do not re-flag:\n${controlState.dismissed.map((d) => `${d.path} — ${d.reason}`).join('\n')}`
          : ''

      return `Review this phase plan for internal inconsistencies:

${phaseState.brief}${cleared}

Return a JSON object: { "findings": [] } if clean, or { "findings": [{ "path": "<item>", "reason": "<why it is inconsistent>" }] }. Output only the JSON.`
    },
  },
  investigateRecipe: {
    profile: '',
    prompt: ({ phaseState, controlState }) => {
      const issues = controlState.raised
        .map((f, i) => `${i + 1}. ${f.path} — ${f.reason}`)
        .join('\n')

      return `The following consistency issues were flagged:

${issues}

Plan:
${phaseState.brief}

For each issue, decide: genuine problem or false positive?

Return a JSON object with two arrays:
- "confirmed": array of issue numbers for real problems
- "dismissed": array of issue numbers for false positives

Output only the JSON.`
    },
  },
}

const adapters: Adapters = {
  // ...
  controls: [...defaultControls, consistencyControl],
}
```

### Profile resolution

Profile resolution follows this priority: `config.taskProfiles[taskType]` → recipe's own `profile` (if non-empty) → `adapters.tools.profile`. So if your control's recipes work best with a specific model, set `profile` on them directly — the consumer can still override via `taskProfiles` if needed, but won't have to think about it otherwise. Setting `profile: ''` means "use whatever the consumer configured globally".

### `afterInvestigate`

An optional hook called after each investigate cycle, receiving only the _newly_ dismissed findings (not the full history). Use it to act on dismissals immediately — before the next check runs.

```ts
import type { QualityControl, ControlFinding, Store } from '@helentherobot/planner'

const myControl: QualityControl = {
  name: 'my-control',
  checkRecipe: { ... },
  investigateRecipe: { ... },
  afterInvestigate(dismissed: ControlFinding[], phase: number, store: Store): void {
    // dismissed contains only findings newly cleared in this investigate cycle.
    // e.g. add their paths to the phase index so future checks treat them as authorised.
    const state = store.read()
    if (!state) return
    // mutate phaseState and call store.write(updatedState) as needed
  },
}
```

The built-in `scopeControl` uses `afterInvestigate` to append dismissed file paths to `phaseState.index`. This means on the next check cycle, the scope recipe sees those files listed as authorised and won't flag them again — no need for the model to remember what it already cleared.

## Evaluations

The `evaluations/` directory contains scripts for running recipes and full plan runs against real model profiles. These are excluded from CI and require valid API keys in `.env`. Available scripts:

- `npm run eval:recipes` — runs all recipe evaluations in sequence
- `npm run eval:recipe` — runs a single named recipe evaluation
- `npm run eval:e2e` — runs a full end-to-end plan; accepts `--min` and `--max` to bound the iteration count, and `--size` to select a fixture prompt
- `npm run eval:compare` — runs the same prompt through multiple profiles side-by-side with `--size` and `--profiles` args

Set `HELEN_PROFILE` in the environment to override the model profile used by the e2e eval:

```
HELEN_PROFILE=flash node --env-file .env npm run eval:e2e -- --min 2 --max 4
```
