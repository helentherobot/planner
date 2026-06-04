# Planner

[![npm](https://img.shields.io/npm/v/@helentherobot/planner)](https://www.npmjs.com/package/@helentherobot/planner)

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

- **`PlanState`** — the full serialisable state of a plan run: the brief, all phases, the task queue, timestamps, the current progress handle, and accumulated questions.
- **`Adapters`** — the bundle the consumer provides: AI tools, persistence, progress reporting, configuration, and quality controls.
- **`Store`** — a persistence adapter with `read()` and `write()` methods, bound by the consumer to a specific location.
- **`Observer`** — a progress reporting adapter that receives start, update, and complete events and returns an opaque handle used to track a single reporting resource (e.g. a Telegram message).
- **`Tools`** — the AI execution adapter: a `Runner` instance, a default profile name, the project `cwd`, and the agent tools to expose. Per-task tool sets can be supplied via `taskTools`.
- **`QualityControl`** — a named concern (vagueness, duplication, scope) with a `checkRecipe` that scans a phase and returns findings, and an `investigateRecipe` that confirms or dismisses each one by number.
- **`ControlFinding`** — a structured finding: `{ path: string, reason: string }`. Both `raised` and `dismissed` lists use this type.
- **`RunResult`** — the discriminated union returned by `run()`: either `{ status: 'complete'; state: PlanState }` or `{ status: 'needs-answers'; questions: Question[]; state: PlanState }`.
- **`Question`** — a clarifying question the model needs answered before it can proceed: `{ id: string, question: string, context?: string }`.
- **`Answer`** — a consumer-supplied response: `{ questionId: string, answer: string }`.
- **`RunOptions`** — options for `run()`: `{ signal?: AbortSignal, answers?: Answer[] }`.

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
      queue: {
        maxConcurrent: 2,
        requestsPerMinute: 50,
        affinityMode: false,
        warmup: false,
      },
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

## Tracking token usage with `onUsage`

`onUsage` is an optional callback on `Adapters`. When provided, it is called once after every LLM invocation — once per `runRecipe` call (recipe-based tasks) and once per `send()` call (`plan-phase` and `gather-recon`). Each call carries a `UsageEvent`:

```ts
interface UsageEvent {
  taskType: string // e.g. 'plan-phase', 'check-phase'
  controlName?: string // set for check-phase and investigate-phase per-control calls
  inputTokens: number
  outputTokens: number
  totalCostUsd?: number
}
```

Use it to accumulate spend totals for a full planning run:

```ts
let totalInputTokens = 0
let totalOutputTokens = 0
let totalCostUsd = 0

const adapters: Adapters = {
  // ...
  onUsage(event) {
    totalInputTokens += event.inputTokens
    totalOutputTokens += event.outputTokens
    totalCostUsd += event.totalCostUsd ?? 0
  },
}

await run(state, adapters)

console.log(
  `Plan complete — $${totalCostUsd.toFixed(4)} (${totalInputTokens} in / ${totalOutputTokens} out)`,
)
```

`check-phase` and `investigate-phase` run controls concurrently, so `onUsage` may be called from multiple in-flight invocations at the same time. A simple accumulator (as above) is fine — JavaScript is single-threaded so the `+=` operations are safe.

When `onUsage` is not provided, behaviour is identical to before — no errors, no overhead.

## Starting a plan

```ts
import { run, createInitialState } from '@helentherobot/planner'

const result = await run(
  createInitialState(
    'Add OAuth2 login with GitHub and Google to the existing Express app.',
  ),
  adapters,
)

if (result.status === 'needs-answers') {
  // The model has questions it needs answered before it can continue.
  // Persist result.state and present result.questions to the user.
  console.log(result.questions)
} else {
  // result.status === 'complete'
  console.log(result.state)
}
```

`run()` returns a `RunResult` — a discriminated union on `status`. If the model encounters ambiguity early in planning (before phases are synthesised), it pauses and surfaces those questions rather than producing a plan based on guesswork.

`run()` calls `observer.start()` internally before the first task and `observer.complete()` when done — you don't call them yourself. The `synthesize-phases` task expands into the full task queue automatically. State is written after every task, so an interrupted run can be resumed.

When `run()` resolves with `status: 'complete'`, the returned state looks something like:

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
  awaitingQuestions: []
  answeredQuestions: [ ...any questions that were answered during the run ]
  pendingQuestions: []
  completedAt: 1735000000000
}
```

## Resuming a plan

```ts
import { run } from '@helentherobot/planner'

const saved = store.read()

if (saved) {
  const result = await run(saved, adapters)
}
```

The orchestrator picks up from `remainingTasks[0]` and continues without any additional setup. If the plan was already complete, `run()` returns immediately.

### Resuming after questions

When `run()` returns `{ status: 'needs-answers' }`, the state is already persisted. Once you have answers, resume by passing them via `RunOptions`:

```ts
import { run } from '@helentherobot/planner'
import type { Answer } from '@helentherobot/planner'

const saved = store.read()

const answers: Answer[] = [
  { questionId: 'q-abc123', answer: 'Use PostgreSQL, hosted on Railway.' },
  { questionId: 'q-def456', answer: 'OAuth only — no email/password login.' },
]

const result = await run(saved, adapters, { answers })
```

`run()` merges the answers into state, clears `awaitingQuestions`, and continues from where it left off. The answered questions accumulate in `state.answeredQuestions` and are threaded into all subsequent prompts so the model stays consistent.

## Cancellation

```ts
import { run } from '@helentherobot/planner'

const controller = new AbortController()

setTimeout(() => controller.abort(), 30_000)

const result = await run(state, adapters, { signal: controller.signal })
```

`run()` checks the signal before starting each task. Aborting stops the run cleanly after the current task finishes. The saved state can be resumed later.

Passing an `AbortSignal` directly (without wrapping in `RunOptions`) is also accepted and remains supported for backward compatibility.

## Per-phase questions and `revise()`

After synthesis, each phase is individually planned. If the model surfaces a question that is specific to a single phase (or a small set of phases), it is collected as a `PhaseQuestion` in `state.pendingQuestions` rather than halting the whole run. The full plan completes, and the per-phase questions are available afterward for the consumer to address one at a time.

```ts
import { revise } from '@helentherobot/planner'

// After a successful run, check for per-phase questions:
if (finalState.pendingQuestions.length > 0) {
  for (const question of finalState.pendingQuestions) {
    const answer = await askUser(question.question)

    // revise() re-queues the affected phases and re-runs them with the answer threaded in.
    finalState = await revise(finalState, adapters, question, answer)
  }
}
```

`revise()` determines which phases need to be re-planned based on the question's `phaseIndex` plus any additional phases the model identifies as affected. It re-queues those phases through the full planning pipeline (plan → normalise → index → check → investigate) and returns the updated `PlanState` when done.

`pendingQuestions` can grow during a `revise()` call — if re-planning a phase surfaces new questions, they appear in the returned state. Process the list until it is empty.

### `PhaseQuestion`

```ts
interface PhaseQuestion extends Question {
  phaseIndex: number | number[] // which phase(s) the question is about
}
```

### `AnsweredQuestion`

```ts
interface AnsweredQuestion extends Question {
  answer: string
  phaseIndex?: number | number[]
}
```

Answered questions (both pre-synthesis and per-phase) accumulate in `state.answeredQuestions` and are visible to all subsequent prompts.

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
      const dismissed = controlState.dismissed
        .map((d) => `${d.path} — ${d.reason}`)
        .join('\n')
      const cleared =
        controlState.dismissed.length > 0
          ? `Previously cleared — do not re-flag:\n${dismissed}`
          : ''

      return `
        ${cleared}

        Review this phase plan for internal inconsistencies:

        ${phaseState.brief}

        Return a JSON object: { "findings": [] } if clean, or { "findings": [{ "path": "<item>", "reason": "<why it is inconsistent>" }] }. Output only the JSON.
      `
    },
  },
  investigateRecipe: {
    profile: '',
    prompt: ({ phaseState, controlState }) => {
      const issues = controlState.raised
        .map((f, i) => `${i + 1}. ${f.path} — ${f.reason}`)
        .join('\n')

      return `
        The following consistency issues were flagged:

        ${issues}

        Plan:
        ${phaseState.brief}

        For each issue, decide: genuine problem or false positive?

        Return a JSON object with two arrays:
        - "confirmed": array of issue numbers for real problems
        - "dismissed": array of issue numbers for false positives

        Output only the JSON.
      `
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

The e2e eval accepts `--answer` to supply answers when resuming a paused run. When a run pauses with `needs-answers`, the eval prints the exact resume command to use:

```
Run paused — needs answers. Resume with:
  node --env-file .env npm run eval:e2e -- --answer "q-abc123=Use PostgreSQL"
```

The `run-with-answers` recipe eval exercises the full pause → answer → resume → completion flow end-to-end.
