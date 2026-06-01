# Initial Setup — `@helentherobot/planner`

- Branch: `feature/001-initial-setup`

## Overview

`@helentherobot/planner` is a standalone npm package that houses the orchestration core: the types, interfaces, task handlers, recipes, and tool factories that build phased plans from a brief.

The package depends on Node built-ins and `@helentherobot/runner` (for the `Recipe` type and runner infrastructure). It exposes `run()` as its public entry point, accepting an `Adapters` bundle that supplies a `Tools` adapter (runner + profile + cwd + agent tools), a `Store` (state persistence), an `Observer` (progress reporting), a `Config`, and a list of `QualityControl` instances. The host supplies the adapters; the package owns the orchestration logic. The three built-in controls (vagueness, duplication, scope) are exported as `defaultControls` and are open to extension — consumers may supply their own.

### Target Outcome

A fully buildable, testable, publishable npm package that:

- Defines all types and interfaces.
- Contains all orchestration logic and task handlers.
- Exposes `run()` as its public entry point.
- Passes `npm run check` (typecheck + format + unit tests) in CI.

## Requirements

### Functional

- [ ] Package builds cleanly with `tsc` and all tests pass with `vitest run`.
- [ ] All types are exported from `src/index.ts`: `PlanState`, `PhaseState`, `Config`, `Task`, `ControlState`.
- [ ] All interfaces are exported: `Store`, `Observer`, `Tools`, `QualityControl`, `ControlRecipeContext`, `Adapters`.
- [ ] Built-in `QualityControl` values exported: `vaguenessControl`, `duplicationControl`, `scopeControl`.
- [ ] `defaultControls` exported as a convenience array of all three.
- [ ] `run` and `expandPhases` are exported.
- [ ] All task handlers are exported, named after their handler file: `handleNormalizePhasePrompt`, `handlePlanPhase`, `handleNormalizePhasePlan`, `handleIndexPhase`, `handleSplitPhase`, `handleCheckPhase`, `handleInvestigatePhase`, `handleRevisePhase`, `handleCollectFeedback`, `handleReorderPhases`, `handleCleanup`, `handleCommitPhase`.
- [ ] `Recipe` interface and all recipes are exported.

### Non-Functional

- [ ] Package structure mirrors `@helentherobot/runner` (same tsconfig, vitest config, CI, devDeps).
- [ ] No imports from any host application — package is self-contained.
- [ ] CI: push + PR to main triggers typecheck + format check + unit tests.
- [ ] `README.md` documents end-to-end usage (see below).

### Out of Scope

- Publishing to npm (publication is a separate step after integration is confirmed).
- Any host application wiring.

## API Design

> These are the intended public shapes. Review and refine before implementation starts.

### `src/types.ts`

```ts
export interface Config {
  maxFilesPerPhase: number
  minimumIterations: number
  maximumIterations: number
}

/**
 * Persisted memory for a single QualityControl across check/investigate cycles.
 * `dismissed` accumulates false-positive findings injected into the next check prompt.
 * `raised` collects confirmed problems batch-fed into revise, then cleared after revise runs.
 */
export interface ControlState {
  dismissed: string[]
  raised: string[]
}

/**
 * State for a single phase. `controls` is keyed by QualityControl.name so
 * new controls are accommodated without a schema change.
 * `prompt` and `index` are set progressively as the phase moves through formatting.
 */
export interface PhaseState {
  title: string
  brief: string
  prompt?: string
  index?: string
  controls: Record<string, ControlState>
  iterations: number
}

/**
 * A unit of work in the orchestration queue.
 * Built-in tasks use `type`, `phase`, and `iteration`.
 * Consumers may add their own fields via the index signature.
 */
export interface Task {
  type: string
  phase?: number
  iteration?: number
  [key: string]: unknown
}

/**
 * The full serialisable state of a plan run.
 * `phases` is ordered — array index is the phase number; insert anywhere to support splits.
 * Timestamps are unix (ms).
 */
export interface PlanState {
  brief: string
  recon: string
  startedAt: number
  completedAt: number | null
  currentTask: Task | null
  progressHandle: unknown
  config: Config
  phases: PhaseState[]
  remainingTasks: Task[]
  completedTasks: Task[]
}
```

---

### `src/store.ts`

```ts
/**
 * Persistence adapter for plan state.
 * The consumer creates an instance bound to a specific feature directory —
 * the package never sees file paths.
 */
export interface Store {
  read(): PlanState | null
  write(state: PlanState): void
}
```

---

### `src/observer.ts`

```ts
export interface ProgressEvent {
  brief: string
  completedTasks: Task[]
  totalTasks: number
  currentTask: Task | null
  isComplete: boolean
}

/**
 * Progress reporting adapter.
 * `start` returns an opaque handle that is passed back to `update` and `complete`,
 * allowing the consumer to track a specific resource (e.g. a Telegram message ID).
 */
export interface Observer<THandle = unknown> {
  start(event: ProgressEvent): Promise<THandle>
  update(handle: THandle, event: ProgressEvent): Promise<void>
  complete(handle: THandle, event: ProgressEvent): Promise<void>
}
```

---

### `src/tools.ts`

```ts
/**
 * AI execution adapter.
 * `runner` handles recipe calls and agent spawning via @helentherobot/runner.
 * `profile` is used when spawning sub-agents (recipes self-specify their own profile).
 * `cwd` is the project root passed to spawned agents for codebase exploration.
 * `agentTools` are passed to spawned agents — the consumer decides what to expose
 * (file reading, bash, web search, etc.). Prompts reference these tools generically,
 * not by name.
 */
export interface Tools {
  runner: Runner
  profile: string
  cwd: string
  agentTools: ToolSet
}
```

---

### `src/checks.ts`

```ts
/**
 * The full runtime context passed to both checkRecipe and investigateRecipe.
 * Recipes read phaseState.brief (and phaseState.index for scope) for content,
 * controlState.dismissed to suppress re-flagging, and controlState.raised
 * when investigating confirmed issues.
 */
export interface ControlRecipeContext {
  phase: number
  iteration: number
  phaseState: PhaseState
  controlState: ControlState
}

/**
 * A single quality control concern.
 * `checkRecipe` scans a phase for potential issues.
 * `investigateRecipe` takes all raised issues and determines which are real problems
 * (→ kept in raised for revise) or false positives (→ moved to dismissed).
 * Built-in controls: vaguenessControl, duplicationControl, scopeControl.
 * Consumers may supply additional controls via Adapters.controls.
 */
export interface QualityControl {
  name: string
  checkRecipe: Recipe<[context: ControlRecipeContext]>
  investigateRecipe: Recipe<[context: ControlRecipeContext]>
}

export const vaguenessControl: QualityControl = {
  name: 'vagueness',
  checkRecipe: checkPhaseVagueness,
  investigateRecipe: investigatePhaseVagueness,
}

export const duplicationControl: QualityControl = {
  name: 'duplication',
  checkRecipe: checkPhaseDuplication,
  investigateRecipe: investigatePhaseDuplication,
}

export const scopeControl: QualityControl = {
  name: 'scope',
  checkRecipe: checkPhaseScope,
  investigateRecipe: investigatePhaseScope,
}

export const defaultControls: QualityControl[] = [
  vaguenessControl,
  duplicationControl,
  scopeControl,
]
```

---

### `src/adapters.ts`

All fields are required. Omitting `store` or `observer` is a fault in consumption — the package provides no fallbacks.

```ts
export interface Adapters {
  tools: Tools
  store: Store
  observer: Observer
  config: Config
  controls: QualityControl[]
}
```

---

### `src/run.ts`

```ts
export async function run(
  state: PlanState,
  adapters: Adapters,
  signal?: AbortSignal,
): Promise<PlanState>
```

---

## README Outline

The README must be a complete, working guide. A consumer should be able to read it and wire up a plan run without looking at any other file. Cover these sections in order:

1. **What it is** — one paragraph: orchestration package, adapters-in/state-out, no host dependencies.

2. **Installation** — `npm install @helentherobot/planner @helentherobot/runner`.

3. **Concepts** — brief glossary: `PlanState`, `Adapters`, `Store`, `Observer`, `Tools`, `QualityControl`. One sentence each.

4. **Implementing `Store`** — show a minimal filesystem implementation with `read()` and `write()` using `JSON.parse`/`JSON.stringify` and a fixed file path.

5. **Implementing `Observer`** — show a minimal console observer that logs progress events and returns a handle.

6. **Building `Adapters`** — show a full `Adapters` object: how to create a `Runner`, pick a profile, set `cwd`, pass `agentTools`, wire `store` and `observer`, set `config`, use `defaultControls`.

7. **Starting a plan** — show how to create an initial `PlanState` (with `brief`, empty `phases`, populated `remainingTasks` starting with `synthesize-phases`, timestamps, etc.) and call `run(state, adapters)`.

8. **Resuming a plan** — show `store.read()` → if state exists and `remainingTasks` is non-empty, pass it to `run()` directly. The orchestrator picks up where it left off.

9. **Cancellation** — show `AbortController`, pass `controller.signal` to `run()`, call `controller.abort()` to stop.

10. **Adding a custom `QualityControl`** — show a minimal custom control with a `checkRecipe` and `investigateRecipe`, then pass it via `Adapters.controls`.

11. **Evaluations** — one paragraph pointing to `evaluations/` and the available npm scripts.

---

## Implementation Plan

> **Code style**: No useless comments. Only add comments that explain tricky/non-obvious code.
> **Before committing**: Run `npm run format` and `npm test` before every commit.
> **No auto-committing**: Only commit when explicitly asked.
> **One step at a time**: Complete only the current step before proceeding.

---

### Phase 1 — Scaffold the package

**Scope**: Create the full package skeleton. After this phase, `npm run check` passes with a stub `src/index.ts` and a placeholder test.

**Steps**:

1. Create `package.json` — mirror `@helentherobot/runner` exactly, changing:
   - `"name"`: `"@helentherobot/planner"`
   - `"version"`: `"0.1.0"`
   - Keep all devDependencies at the same pinned versions as runner.
   - `dependencies`: `{ "@helentherobot/runner": "^0.3.5", "ai": "..." }` — `runner` provides `Recipe` and runner types; `ai` version TBD from runner's package.json, needed for `ToolSet` in `src/tools.ts`.

2. Create `tsconfig.json`:

   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "NodeNext",
       "moduleResolution": "NodeNext",
       "types": ["node"],
       "strict": true,
       "declaration": true,
       "declarationMap": true,
       "ignoreDeprecations": "6.0",
       "outDir": "dist",
       "rootDir": "src"
     },
     "include": ["src/**/*"],
     "exclude": ["tests/**/*"]
   }
   ```

3. Create `vitest.config.ts` with `@` alias pointing to `./src`:

   ```ts
   import { defineConfig } from 'vitest/config'
   import path from 'path'

   export default defineConfig({
     resolve: {
       alias: { '@': path.resolve(import.meta.dirname, './src') },
     },
     test: {
       coverage: { provider: 'v8' },
       exclude: ['**/node_modules/**', '**/dist/**', '**/*.smoke.ts'],
     },
   })
   ```

4. Create `vitest.smoke.config.ts` — same `@` alias and resolver as `vitest.config.ts`, but the `test` block only includes `tests/smoke/**/*.smoke.ts` with no coverage or exclude rules.

5. Create `.github/workflows/ci.yml` — copy from runner (node 24, `npm ci`, `npm run check`).

6. Create `.editorconfig` — copy from runner exactly.

7. Create `src/index.ts`: `export {}`

8. Create `tests/index.test.ts`:

   ```ts
   import { describe, it } from 'vitest'
   describe('placeholder', () => {
     it('passes', () => {})
   })
   ```

9. Run `npm install`.

10. Run `npm run check` — must pass cleanly.

**Tests**: Placeholder test + typecheck + format check all pass.

---

### Phase 2 — Types

**Scope**: Define all types in `src/types.ts` and export them.

**Steps**:

1. Create `src/types.ts` with:
   - `Config`
   - `Task`
   - `ControlState`
   - `PhaseState`
   - `PlanState`

2. Export all five from `src/index.ts`.

3. Add `tests/types.test.ts` — imports each type and uses it in a typed assertion to confirm exports are correct.

4. Run `npm run check` — must pass.

**Tests**: `tests/types.test.ts` confirms all types are exported.

---

### Phase 3 — Interfaces and orchestrator core

**Scope**: Implement all interfaces, core orchestration logic, task handlers, and recipes.

**Steps**:

1. `Recipe` comes from `@helentherobot/runner` — no local declaration needed.

2. Create interface files (nothing depends on these; everything depends on them):
   - `src/store.ts` — `Store`
   - `src/observer.ts` — `Observer`, `ProgressEvent`
   - `src/tools.ts` — `Tools`
   - `src/checks.ts` — `QualityControl`, built-in controls, `defaultControls`

3. Create recipe files under `src/recipes/` in execution order:
   - `synthesize-phases.ts` — produces the initial phase list from a brief
   - `normalize-phase-prompt.ts` — normalises a phase preamble into an agent prompt (pre-format)
   - `plan-phase.ts` — drafts a phase plan (run by the planning agent)
   - `normalize-phase-plan.ts` — cleans the written plan's prose and style (post-format)
   - `index-phase.ts` — extracts a file index from the plan (post-format)
   - `split-phase.ts` — divides a phase's files into capped groups (split check)
   - `check-phase-vagueness.ts` — finds vague instructions
   - `investigate-phase-vagueness.ts` — verifies each vagueness finding
   - `check-phase-duplication.ts` — finds work covered by other phases
   - `investigate-phase-duplication.ts` — verifies each duplication finding
   - `check-phase-scope.ts` — finds out-of-scope files
   - `investigate-phase-scope.ts` — verifies each scope finding
   - `revise-phase.ts` — applies confirmed issues to produce a revised plan

4. Create core state utilities (depend on interfaces and types only):
   - `src/expand-phases.ts` — `expandPhases`
   - `src/phase-map.ts` — phase ordering and split helpers
   - `src/claimed-files.ts` — `readClaimedFiles`

5. Create task handlers under `src/tasks/` (named after their recipe where applicable, in execution order):
   - `normalize-phase-prompt.ts` — normalises the phase prompt
   - `plan-phase.ts` — spawns an agent using `adapters.tools.runner` + `adapters.tools.profile` via `send()`, passing the `__plan_*` tools merged with `adapters.tools.agentTools`, with the normalised `phaseState.prompt` as the user message; writes the agent's response to `phaseState.brief` via `__plan_write_phase`
   - `normalize-phase-plan.ts` — cleans the written plan's prose
   - `index-phase.ts` — extracts the file index from the plan
   - `split-phase.ts` — splits oversized phases
   - `check-phase.ts` — runs all controls' `checkRecipe`s in parallel
   - `investigate-phase.ts` — runs all controls' `investigateRecipe`s in parallel
   - `revise-phase.ts` — applies raised issues via `revise-phase` recipe
   - `collect-feedback.ts` — reads all `ControlState.raised` across controls; if all are empty and `phase.iterations >= config.minimumIterations`, advances (queues `commit-phase`); if all are empty but below minimum, loops (queues `check-phase` again); if any `raised` items exist, queues `revise-phase` then `check-phase`
   - `reorder-phases.ts` — reorders the `state.phases` array and rewrites cross-phase index references within each `phaseState.brief` to reflect the new ordering
   - `cleanup.ts` — final cleanup pass
   - `commit-phase.ts` — marks a phase complete

6. Create `src/run.ts` — the orchestration entry point (depends on all task handlers).

7. If `ToolSet` from the `ai` SDK is needed for `Tools.agentTools`, confirm it can be imported from `@helentherobot/runner` — add `ai` as a direct devDependency only if not.

8. Export everything public from `src/index.ts`.

9. Add unit tests mirroring the `src/` structure under `tests/`:
   - `tests/expand-phases.test.ts`
   - `tests/run.test.ts` — orchestration flow with mocked `Store`, `Observer`, `Tools`
   - `tests/tasks/check-phase.test.ts`
   - `tests/tasks/collect-feedback.test.ts`
   - `tests/tasks/split-phase.test.ts`
   - `tests/tasks/reorder-phases.test.ts`
   - (one test file per source file that has testable logic)

10. Run `npm run check` — must pass.

**Tests**: Unit tests using `vi.fn()` mocks for `Store`, `Observer`, and `Tools`.

---

### Phase 4 — `Adapters` interface and wiring

**Scope**: Define `Adapters` and export it. `build_plan_read` and `build_plan_write` are created internally by `run()` for spawned agents and are not part of the public API — no tool factory files are needed.

**Steps**:

1. Create `src/adapters.ts` — `Adapters` interface:

   ```ts
   export interface Adapters {
     tools: Tools
     store: Store
     observer: Observer
     config: Config
     controls: QualityControl[]
   }
   ```

2. Export `Adapters` from `src/index.ts`.

3. Run `npm run check` — must pass.

**Tests**: Full `npm run check` clean.

---

## Technical Notes

### Store utility helpers

`Store` exposes only `read()` and `write()`. Task handlers that need to update a single phase or control state use internal (non-exported) helper functions that wrap the read-mutate-write pattern:

```ts
// internal to src/store-helpers.ts, not exported
function updatePhase(store: Store, index: number, update: Partial<PhaseState>): void {
  const state = store.read() ?? createDefaultState()
  state.phases[index] = { ...state.phases[index], ...update }
  store.write(state)
}

function updateControl(
  store: Store,
  phaseIndex: number,
  name: string,
  update: Partial<ControlState>,
): void {
  const state = store.read() ?? createDefaultState()
  const phase = state.phases[phaseIndex]
  phase.controls[name] = { ...(phase.controls[name] ?? { dismissed: [], raised: [] }), ...update }
  store.write(state)
}
```

Consumers only implement `read` and `write` — they never see the per-phase or per-control granularity.

**No clobbering risk**: task handlers execute sequentially from `remainingTasks`. Parallelism only exists _within_ a single handler (e.g. `handleCheckPhase` fires all control recipes with `Promise.all`). The handler waits for all results, then performs a single merged state write before returning. Two handlers never write simultaneously.

### Built-in task types

`Task.type` mirrors the handler name exactly. Built-in tasks queued by `run()`:

| `type`                   | `phase` | When queued                           |
| ------------------------ | ------- | ------------------------------------- |
| `synthesize-phases`      | —       | Start of run                          |
| `normalize-phase-prompt` | ✓       | After phase list is built             |
| `plan-phase`             | ✓       | After prompt is normalised            |
| `normalize-phase-plan`   | ✓       | After agent writes the plan           |
| `index-phase`            | ✓       | After plan is normalised              |
| `split-phase`            | ✓       | After index is built                  |
| `check-phase`            | ✓       | After split (or after revise)         |
| `investigate-phase`      | ✓       | After check finds issues              |
| `revise-phase`           | ✓       | After investigation confirms problems |
| `collect-feedback`       | ✓       | After investigate/revise cycle        |
| `reorder-phases`         | —       | After all phases complete             |
| `cleanup`                | —       | After reorder                         |
| `commit-phase`           | ✓       | When a phase is finalised             |

Consumers can add their own task types — `run()` will dispatch unknown types to an optional `onUnknownTask` hook (TBD) or ignore them.

### Internal agent tools

`run()` creates a set of specialist tools internally (not exported) and passes them to every spawned agent alongside `adapters.tools.agentTools`. These are closures over `adapters.store`:

| Tool                 | Args                               | What it does                             |
| -------------------- | ---------------------------------- | ---------------------------------------- |
| `__plan_write_recon` | `(content: string)`                | Sets `state.recon` via the store         |
| `__plan_read_recon`  | `()`                               | Returns `state.recon`                    |
| `__plan_write_phase` | `(phase: number, content: string)` | Sets `phases[phase].brief` via the store |
| `__plan_read_phase`  | `(phase: number)`                  | Returns `phases[phase].brief`            |

Agents reference these by their exact `__plan_*` names in prompts — they are the only tools the package names explicitly. The `__plan_` prefix prevents collisions with consumer-provided `agentTools`, which are referenced generically.

### Recipe example

How a control recipe is defined. The `prompt` function destructures `ControlRecipeContext` to build the prompt string:

```ts
import type { Recipe } from '@helentherobot/runner'
import type { ControlRecipeContext } from '../checks.js'

export const checkPhaseVagueness: Recipe<[ControlRecipeContext]> = {
  profile: 'haiku',
  prompt: ({ phaseState, controlState }) => {
    const cleared =
      controlState.dismissed.length > 0
        ? `\nPreviously reviewed and cleared — do not re-flag:\n${controlState.dismissed.join('\n')}`
        : ''

    return `Review this phase plan for vague or ambiguous instructions:

${phaseState.brief}${cleared}

Return either "(clean)" or a bullet list of vague steps.`
  },
}
```

The orchestrator calls `runner.run(control.checkRecipe, [context])`. Runner calls `recipe.prompt(context)` to produce the prompt string, sends it to the model, and returns the text response.

### Agent prompt conventions

Spawned agent prompts only reference the package's own `__plan_*` tools by name — `__plan_write_recon`, `__plan_read_recon`, `__plan_write_phase`, `__plan_read_phase`. Consumer-provided tools (`agentTools`) are never named explicitly: prompts say things like "use available tools to explore the project" or "search for any libraries mentioned in the brief". The agent discovers and uses whatever the consumer supplied without the package needing to know the names.

### Check / investigate / revise loop

The loop is data-driven: the orchestrator runs all `Adapters.controls` (a `QualityControl[]`) in parallel each iteration rather than hardcoding concern types or running them sequentially. Each `QualityControl` is a value with a `name`, a `checkRecipe`, and an `investigateRecipe`.

Each iteration:

1. All `checkRecipe`s run in parallel — each scans the phase and returns a list of potential issues (or `(clean)`). The `ControlState.dismissed` list for each control is injected into the prompt so already-cleared items are not re-flagged.
2. All `investigateRecipe`s run in parallel — one call per control, receiving all flagged issues at once. Each returns a structured result: confirmed problems → appended to `ControlState.raised`; dismissals with reasoning → appended to `ControlState.dismissed`.
3. If any `raised` items exist across all controls, `revise-phase` runs once with all of them combined. `ControlState.raised` is cleared for each control after revise completes.

The loop repeats until every control returns `(clean)` in the same iteration.

The orchestrator launches concurrent work with `Promise.all` and does not implement any throttling. `Recipe` is an async type — `AI.runRecipe` returns a `Promise`. Actual concurrency is entirely the `Tools` adapter's concern: a consumer with a query queue (e.g. one that allows only 1–2 simultaneous requests) will naturally throttle the parallel calls without any changes to the orchestrator.

The package exports three built-in checks (`vaguenessControl`, `duplicationControl`, `scopeControl`) and a `defaultControls` convenience array. Consumers can pass any `QualityControl[]` — including custom ones — via `Adapters.controls`.

### `ai` SDK dependency

`ToolSet` is used in the `Tools` interface (`agentTools: ToolSet`). Import it from `@helentherobot/runner` if it re-exports the type (runner already depends on `ai`), otherwise add `ai` as a direct `devDependency` for type-only usage. No runtime `ai` SDK calls in this package — runner handles all model communication.

### `Recipe` interface

`Recipe` is exported from `@helentherobot/runner` — import it from there. No re-declaration in this package.

### Orphaned recipes

Three recipe files (`criticise-phase.ts`, `summarise-feedback.ts`, `rewrite-references.ts`) exist in the source but are not yet used. Do not create them in this feature — they are candidates for a future feature.

## Files Modified/Created

### Package config

- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `vitest.smoke.config.ts`
- `.github/workflows/ci.yml`
- `.editorconfig`
- `LICENSE.md`
- `README.md`

### Source

- `src/index.ts`
- `src/types.ts`
- `src/adapters.ts`
- `src/store.ts`
- `src/store-helpers.ts`
- `src/observer.ts`
- `src/tools.ts`
- `src/checks.ts`
- `src/run.ts`
- `src/expand-phases.ts`
- `src/phase-map.ts`
- `src/claimed-files.ts`
- `src/tasks/check-phase.ts`
- `src/tasks/cleanup.ts`
- `src/tasks/collect-feedback.ts`
- `src/tasks/commit-phase.ts`
- `src/tasks/normalize-phase-prompt.ts`
- `src/tasks/normalize-phase-plan.ts`
- `src/tasks/index-phase.ts`
- `src/tasks/reorder-phases.ts`
- `src/tasks/revise-phase.ts`
- `src/tasks/split-phase.ts`
- `src/recipes/normalize-phase-plan.ts`
- `src/recipes/normalize-phase-prompt.ts`
- `src/recipes/index-phase.ts`
- `src/recipes/split-phase.ts`
- `src/recipes/revise-phase.ts`
- `src/recipes/plan-phase.ts`
- `src/recipes/check-phase-vagueness.ts`
- `src/recipes/check-phase-duplication.ts`
- `src/recipes/check-phase-scope.ts`
- `src/recipes/investigate-phase-vagueness.ts`
- `src/recipes/investigate-phase-duplication.ts`
- `src/recipes/investigate-phase-scope.ts`
- `src/recipes/synthesize-phases.ts`

### Tests

- `tests/index.test.ts`
- `tests/types.test.ts`
- `tests/expand-phases.test.ts`
- `tests/run.test.ts`
- `tests/tasks/reorder-phases.test.ts`
- `tests/tasks/collect-feedback.test.ts`
- `tests/tasks/split-phase.test.ts`

## Evaluations

Evaluations run against real model profiles and are excluded from CI. They live under `evaluations/` and have their own npm scripts.

### `evaluations/config.ts`

Exports three things:

**1. Profiles** — runner configs for each model to evaluate against:

```ts
/** Runner configs keyed by profile name (e.g. 'sonnet', 'haiku', 'gpt4o-mini'). */
export const profiles: Record<string, RunnerConfig> = {}

/**
 * Test briefs by size, used for e2e evaluations.
 * Ranges from a trivial 2-line request to a large multi-constraint brief.
 */
export const prompts = {
  tiny: '...',
  small: '...',
  medium: '...',
  large: '...',
  huge: '...',
}

/**
 * A single evaluation scenario for a QualityControl.
 * `phase` and `control` are deep-merged with the eval runner's defaults —
 * each scenario only needs to specify what it wants to vary.
 * `expected` describes what good output looks like, for human verification.
 */
export interface ControlFixture {
  name: string
  phase?: Partial<PhaseState>
  control?: Partial<ControlState>
  expected: string
}

/**
 * Fixtures grouped by control name.
 * Each control has multiple scenarios covering: flagging new issues,
 * suppressing dismissed items, and returning clean when nothing is wrong.
 */
export const fixtures: Record<string, ControlFixture[]> = {
  vagueness: [
    {
      name: 'flags-vague-steps',
      phase: { brief: '...' }, // brief contains deliberately ambiguous instructions
      expected: 'Bullet list of vague steps',
    },
    {
      name: 'does-not-reflag-dismissed',
      phase: { brief: '...' },
      control: { dismissed: ['...'] }, // dismissed contains the same vague step
      expected: '(clean) — dismissed item should be suppressed',
    },
    {
      name: 'all-clear',
      phase: { brief: '...' }, // brief has clear, unambiguous instructions
      expected: '(clean)',
    },
  ],
  duplication: [
    // same pattern: flags duplication, ignores dismissed, returns clean
  ],
  scope: [
    // same pattern: flags out-of-scope files, ignores dismissed, returns clean
    // scope fixtures also set phase.index to define the authorised file list
  ],
}
```

Each recipe eval runs all scenarios for its control and prints actual output alongside `expected` for each.

### Recipe evaluations (`evaluations/recipes/`)

One file per recipe. Each runs the recipe against a real profile and prints the raw output. Used to eyeball quality in isolation.

Files:

- `synthesize-phases.ts`
- `plan-phase.ts`
- `normalize-phase-plan.ts`
- `normalize-phase-prompt.ts`
- `index-phase.ts`
- `split-phase.ts`
- `revise-phase.ts`
- `check-phase-vagueness.ts`
- `investigate-phase-vagueness.ts`
- `check-phase-duplication.ts`
- `investigate-phase-duplication.ts`
- `check-phase-scope.ts`
- `investigate-phase-scope.ts`

### E2E plan evaluation (`evaluations/e2e/plan.ts`)

Runs a full plan end-to-end against a real profile. Accepts CLI args:

```
--size tiny|small|medium|large|huge   (default: small)
--iterations N                         (overrides config.minimumIterations)
--profile <name>                       (which profile to use)
```

Writes state to a temp directory and prints task-by-task progress.

### Profile comparison evaluation (`evaluations/e2e/compare-profiles.ts`)

Runs the same prompt through multiple profiles and outputs a side-by-side comparison of the resulting plans. Used to assess quality vs cost trade-offs across model sizes.

```
--size tiny|small|medium|large|huge   (default: small)
--profiles p1,p2,p3                   (comma-separated profile names)
```

### npm scripts

```json
"eval:recipes": "tsx evaluations/recipes/run-all.ts",
"eval:recipe": "tsx evaluations/recipes/run.ts",
"eval:e2e": "tsx evaluations/e2e/plan.ts",
"eval:compare": "tsx evaluations/e2e/compare-profiles.ts"
```

### Files

- `evaluations/config.ts`
- `evaluations/recipes/synthesize-phases.ts`
- `evaluations/recipes/plan-phase.ts`
- `evaluations/recipes/normalize-phase-plan.ts`
- `evaluations/recipes/normalize-phase-prompt.ts`
- `evaluations/recipes/index-phase.ts`
- `evaluations/recipes/split-phase.ts`
- `evaluations/recipes/revise-phase.ts`
- `evaluations/recipes/check-phase-vagueness.ts`
- `evaluations/recipes/investigate-phase-vagueness.ts`
- `evaluations/recipes/check-phase-duplication.ts`
- `evaluations/recipes/investigate-phase-duplication.ts`
- `evaluations/recipes/check-phase-scope.ts`
- `evaluations/recipes/investigate-phase-scope.ts`
- `evaluations/recipes/run-all.ts`
- `evaluations/recipes/run.ts`
- `evaluations/e2e/plan.ts`
- `evaluations/e2e/compare-profiles.ts`

---

## Questions/Decisions Needed

- [ ] Should the three orphaned recipes be included or dropped?

## Decisions Made

- **`ai` SDK dependency**: `ToolSet` is not re-exported by `@helentherobot/runner`. Add `ai` as a direct `dependencies` entry so `src/tools.ts` can import `ToolSet`.
- **Scope**: This package owns the orchestration core only. Host wiring is out of scope.
- **`cwd` source**: Spawned agents receive `cwd` from `adapters.tools.cwd` — no separate context type needed.
- **`check-phase` and `commit-phase` included**: No host deps, so they belong here even though they are also used by implementation workflows.

## Session History

### Session 1

- Planned four phases: scaffold, types, core extraction, Adapters wiring.
- Confirmed zero host-application dependencies in any file being included.

## Progress

### Completed

- Phase 1 — Scaffold the package
- Phase 2 — Types
- Phase 3 — Interfaces and orchestrator core
- Phase 4 — Adapters interface and wiring

### In Progress

### To Do
