# Quality of Life

- Branch: `feature/002-quality-of-life`

## Overview

`@helentherobot/planner` drives multi-phase planning and execution of complex coding tasks. As it stands, each phase agent operates in isolation — it cannot see what files other phases have already claimed. This causes overlapping plans, redundant work, and scope-check false-negatives when two phases independently touch the same files.

Additionally, the planner owns all LLM invocations internally (via `runRecipe` and `send()`), so token and cost data is currently invisible to consumers. Helen and other callers have no way to attribute usage to a specific planning run or accumulate spend totals.

Both gaps need closing before Helen migrates to the planner package. They ship together because they touch the same files — `src/types.ts`, `src/helpers.ts`, and every task handler.

### Background / Current Behavior

- **Current behavior**: `plan-phase` builds its user message from `phaseState.prompt ?? phaseState.brief` with no awareness of other phases. `check-phase` passes `{ phase, iteration, phaseState, controlState }` to every quality-control recipe — no sibling phase data included. Token/cost usage from `runner.run()` and `send()` is discarded after each call.
- **Problem**: Phase agents draft plans that overlap with files already assigned elsewhere; scope-check and duplication-check can't flag cross-phase conflicts; consumers can't observe usage.
- **Where it happens**: `src/tasks/plan-phase.ts`, `src/tasks/check-phase.ts`, `src/prompts/check-phase/scope-check.ts`, `src/prompts/check-phase/duplication-check.ts`, `src/helpers.ts`, and all task handlers.
- **Impact**: Multi-phase plans risk redundant or conflicting implementations; Helen can't record token spend per planning run.

### Target Outcome

This feature will add cross-phase file context to planning and checking agents, and expose an `onUsage` callback on `Adapters`, so that consumers can:

- Rely on phase agents automatically seeing which files other phases have claimed before writing their own plans
- Trust that scope and duplication checks consider the entire plan, not just one phase in isolation
- Receive a `UsageEvent` for every LLM invocation and accumulate cost/token data for a full planning run

## Requirements

### Functional

- [ ] `plan-phase` prepends a cross-phase context block to its user message whenever one or more other phases have a non-empty `index`; the block is absent (no empty heading) when no other phases are indexed yet
- [ ] `check-phase` passes `otherPhases: OtherPhaseContext[]` to every `runRecipe` call; `scope-check` and `duplication-check` prompts render the cross-phase file lists when present
- [ ] `Adapters.onUsage` is called once per `runRecipe` invocation (after `runner.run()` resolves) and once per `send()` invocation (after the call resolves), carrying `taskType`, optional `controlName`, `inputTokens`, `outputTokens`, and `totalCostUsd`
- [ ] When `onUsage` is not provided, all behaviour is identical to before (no-op; no errors)
- [ ] When no other phases have a non-empty `index`, `otherPhases` is an empty array and prompt blocks render as empty strings — identical output to the current behaviour

### Non-Functional

- [ ] Backwards compatibility: `OtherPhaseContext[]` added to `ControlRecipeContext` is additive — existing `QualityControl.checkRecipe` prompt functions that destructure only `{ phaseState, controlState }` continue to compile and behave identically
- [ ] Backwards compatibility: `onUsage` is optional on `Adapters` — all existing callers require no changes
- [ ] No new runtime dependencies introduced

### Out of Scope

- Per-step usage breakdown inside a single `send()` call (aggregate totals per invocation are sufficient)
- `investigate-phase` cross-phase context (only `check-phase` needs it for now)
- Exposing cross-phase context to `vagueness-check` (it only checks within-phase vagueness)
- Updating `@helentherobot/runner` to use `totalCostUsd?: number` instead of `totalCostUsd: number | undefined` (follow-on)

## Implementation Plan

> **Code style**: No useless comments. Only add comments that explain tricky/non-obvious code.
> **Before committing**: Run `npm run format` and `npm test` before every commit.
> **No auto-committing**: Only commit when explicitly asked.
> **One step at a time**: Complete only the current step before asking to proceed.

---

### Phase 1 — Type system foundations

**Files**: `src/types.ts`
**Tests**: none required for this phase (pure type additions, verified by TypeScript compilation in later phases)

#### Steps

1. **Add `OtherPhaseContext` interface** after the `ControlState` definition:

   ```ts
   export interface OtherPhaseContext {
     index: number      // zero-based phase index (= phase number - 1)
     title: string
     fileIndex: string  // the phase's index field — empty string when not yet indexed
   }
   ```

   Rationale: `index` (numeric) is needed so prompts can say "Phase 2". `title` labels the phase in the prompt. `fileIndex` is the raw `PhaseState.index` string (file list) — using the existing field name avoids confusion with the numeric `index`. `brief` is intentionally omitted — it isn't used in any prompt template and would add tokens for no benefit.

2. **Extend `ControlRecipeContext`** with `otherPhases`:

   ```ts
   export interface ControlRecipeContext {
     phase: number
     iteration: number
     phaseState: PhaseState
     controlState: ControlState
     otherPhases: OtherPhaseContext[]   // empty array when no other phase is indexed
   }
   ```

   Existing prompt functions destructure only `{ phaseState, controlState }` — this is purely additive and does not break them.

3. **Add `UsageEvent` interface** after `ControlRecipeContext`:

   ```ts
   export interface UsageEvent {
     taskType: string          // task.type, e.g. 'plan-phase', 'check-phase'
     controlName?: string      // set for check-phase and investigate-phase per-control calls
     inputTokens: number
     outputTokens: number
     totalCostUsd?: number
   }
   ```

4. **Extend `Adapters`** with the optional callback:

   ```ts
   export interface Adapters {
     tools: Tools
     store: Store
     observer: Observer
     config: Config
     controls: QualityControl[]
     onUsage?: (event: UsageEvent) => void
   }
   ```

   `onUsage` is optional (first optional field on `Adapters`) — no existing caller is broken.

5. Run `npm run format` and `npx tsc --noEmit` to confirm no type errors before moving on.

---

### Phase 2 — Cross-phase file awareness

**Files**: `src/tasks/plan-phase.ts`, `src/tasks/check-phase.ts`, `src/prompts/check-phase/scope-check.ts`, `src/prompts/check-phase/duplication-check.ts`
**Tests**: `tests/tasks/plan-phase.test.ts` (new), `tests/tasks/check-phase.test.ts` (update existing)

#### Steps

1. **`src/tasks/plan-phase.ts`** — compute `otherPhases` and prepend to the user message:

   ```ts
   const otherPhases = state.phases
     .map((p, i) => ({ index: i, title: p.title, fileIndex: p.index ?? '' }))
     .filter((p) => p.index !== phase && p.fileIndex.length > 0)

   const crossPhaseBlock = otherPhases.length > 0
     ? 'Other phases already planned — avoid these files unless this phase specifically requires them:\n\n' +
       otherPhases
         .map((p) => `Phase ${p.index + 1} — ${p.title}:\n${p.fileIndex}`)
         .join('\n\n') +
       '\n\n'
     : ''

   const userMessage = crossPhaseBlock + (phaseState.prompt ?? phaseState.brief)
   ```

   Replace the existing `send()` call's first message with `userMessage` (was `phaseState.prompt ?? phaseState.brief`).

2. **`src/tasks/check-phase.ts`** — compute `otherPhases` from `state.phases` and thread it into every `runRecipe` call:

   ```ts
   const otherPhases: OtherPhaseContext[] = state.phases
     .map((p, i) => ({ index: i, title: p.title, fileIndex: p.index ?? '' }))
     .filter((p) => p.index !== phase && p.fileIndex.length > 0)
   ```

   Then in the controls loop, extend the context object:

   ```ts
   await runRecipe(
     adapters.tools.runner,
     await resolveProfile(adapters, task.type, control.checkRecipe.profile),
     control.checkRecipe,
     [{ phase, iteration, phaseState, controlState, otherPhases }],
   )
   ```

   Import `OtherPhaseContext` from `../types`.

3. **`src/prompts/check-phase/scope-check.ts`** — add cross-phase file section before the plan:

   - Update the `prompt()` destructuring to include `otherPhases`
   - Compute a `crossPhaseBlock`:

     ```ts
     const crossPhaseBlock = otherPhases.length > 0
       ? 'Files already claimed by other phases — flag any file in this phase\'s index that also appears here:\n\n' +
         otherPhases
           .map((p) => `Phase ${p.index + 1} (${p.title}):\n${p.fileIndex}`)
           .join('\n\n') +
         '\n\n'
       : ''
     ```

   - Insert `crossPhaseBlock` into the returned prompt string, before the section that lists the current phase's plan/index.

4. **`src/prompts/check-phase/duplication-check.ts`** — same pattern:

   - Update the `prompt()` destructuring to include `otherPhases`
   - Compute a `crossPhaseBlock`:

     ```ts
     const crossPhaseBlock = otherPhases.length > 0
       ? 'Work already planned in other phases — flag anything in this phase that duplicates what another phase intends:\n\n' +
         otherPhases
           .map((p) => `Phase ${p.index + 1} (${p.title}):\n${p.fileIndex}`)
           .join('\n\n') +
         '\n\n'
       : ''
     ```

   - Insert `crossPhaseBlock` into the returned prompt string, before the section that lists the current phase's plan.

5. **`tests/tasks/plan-phase.test.ts`** (new file) — cover:

   - When `state.phases` has only one phase (current phase), `otherPhases` is empty and the user message equals `phaseState.prompt ?? phaseState.brief` verbatim (no prepended block)
   - When another phase exists but has an empty `index`, it is excluded from the cross-phase block
   - When another phase has a non-empty `index`, the cross-phase block is prepended to the user message and contains that phase's title and file list
   - The `send()` call receives the augmented message as the first element of its messages array
   - Use the same factory/mock patterns as `tests/tasks/check-phase.test.ts` (inline adapters, `vi.fn()` for runner)

6. **`tests/tasks/check-phase.test.ts`** (update) — add cases:

   - When `state.phases` has no other indexed phases, `otherPhases` passed to the recipe context is `[]`
   - When another phase has a non-empty `index`, `otherPhases` contains that phase and is passed through to the recipe context

7. Run `npm run format` and `npm test` to confirm all tests pass.

---

### Phase 3 — `onUsage` hook wiring

**Files**: `src/helpers.ts`, `src/tasks/synthesize-phases.ts`, `src/tasks/normalize-phase-prompt.ts`, `src/tasks/normalize-phase-plan.ts`, `src/tasks/index-phase.ts`, `src/tasks/split-phase.ts`, `src/tasks/check-phase.ts`, `src/tasks/investigate-phase.ts`, `src/tasks/revise-phase.ts`, `src/tasks/gather-recon.ts`, `src/tasks/plan-phase.ts`
**Tests**: `tests/tasks/check-phase.test.ts`, `tests/tasks/plan-phase.test.ts`, `tests/tasks/split-phase.test.ts`, `tests/tasks/synthesize-phases.test.ts` (new or update as applicable)

#### Steps

1. **`src/helpers.ts`** — add optional `usageCtx` parameter to `runRecipe`:

   ```ts
   import type { Adapters, UsageEvent } from './types'

   type UsageCtx = {
     onUsage: Adapters['onUsage']
     taskType: string
     controlName?: string
   }

   export function runRecipe<TArgs extends unknown[]>(
     runner: Runner,
     profile: string,
     recipe: Recipe<TArgs>,
     args: TArgs,
     usageCtx?: UsageCtx,
   ) {
     const result = runner.run({ ...recipe, profile }, args)
     if (usageCtx?.onUsage) {
       result.then((r) => {
         usageCtx.onUsage!({
           taskType: usageCtx.taskType,
           controlName: usageCtx.controlName,
           inputTokens: r.usage.inputTokens,
           outputTokens: r.usage.outputTokens,
           totalCostUsd: r.usage.totalCostUsd,
         })
       })
     }
     return result
   }
   ```

   Note: `runner.run()` returns a `Promise<RunResult>` — the `.then()` is a side-effect chain; the original promise is still returned to the caller unchanged. If `onUsage` is absent, the function is identical to before.

   Alternative (cleaner, avoids `.then()` side-effect): make `runRecipe` async and `await` the result before firing the callback. Check whether any existing caller depends on the synchronous return — all callers already `await` it, so making it `async` is safe. Prefer this:

   ```ts
   export async function runRecipe<TArgs extends unknown[]>(
     runner: Runner,
     profile: string,
     recipe: Recipe<TArgs>,
     args: TArgs,
     usageCtx?: UsageCtx,
   ) {
     const result = await runner.run({ ...recipe, profile }, args)
     usageCtx?.onUsage?.({
       taskType: usageCtx.taskType,
       controlName: usageCtx.controlName,
       inputTokens: result.usage.inputTokens,
       outputTokens: result.usage.outputTokens,
       totalCostUsd: result.usage.totalCostUsd,
     })
     return result
   }
   ```

2. **`src/tasks/synthesize-phases.ts`** — add `usageCtx` to its `runRecipe` call:

   ```ts
   await runRecipe(runner, profile, synthesizeRecipe, [args], {
     onUsage: adapters.onUsage,
     taskType: task.type,
   })
   ```

3. **`src/tasks/normalize-phase-prompt.ts`** — same pattern (single `runRecipe` call).

4. **`src/tasks/normalize-phase-plan.ts`** — same pattern (single `runRecipe` call).

5. **`src/tasks/index-phase.ts`** — same pattern (single `runRecipe` call).

6. **`src/tasks/split-phase.ts`** — same pattern; `runRecipe` only runs inside the `fileCount > maxFiles` branch — fire `onUsage` only when the recipe actually runs (already the case naturally).

7. **`src/tasks/revise-phase.ts`** — same pattern; `runRecipe` only runs when issues exist — fire `onUsage` only on that path.

8. **`src/tasks/check-phase.ts`** — `runRecipe` is called once per control inside `Promise.all`. Thread `controlName` through:

   ```ts
   await runRecipe(
     adapters.tools.runner,
     await resolveProfile(adapters, task.type, control.checkRecipe.profile),
     control.checkRecipe,
     [{ phase, iteration, phaseState, controlState, otherPhases }],
     { onUsage: adapters.onUsage, taskType: task.type, controlName: control.name },
   )
   ```

9. **`src/tasks/investigate-phase.ts`** — same as check-phase: `runRecipe` per control inside `Promise.all`, pass `controlName: control.name`.

10. **`src/tasks/gather-recon.ts`** — call `onUsage` after `send()` resolves:

    ```ts
    const result = await send(adapters.tools.runner, { ... }, [userMessage])

    adapters.onUsage?.({
      taskType: task.type,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalCostUsd: result.usage.totalCostUsd,
    })
    ```

11. **`src/tasks/plan-phase.ts`** — same pattern after its `send()` call (already modified in Phase 2 to build the augmented message):

    ```ts
    const result = await send(adapters.tools.runner, { ... }, [userMessage])

    adapters.onUsage?.({
      taskType: task.type,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalCostUsd: result.usage.totalCostUsd,
    })
    ```

12. **Tests** — for each task handler that has an existing test file, add a case where `adapters.onUsage` is a `vi.fn()` and verify it is called with the correct `taskType` and `usage` fields after the handler runs. Specifically:

    - `tests/tasks/check-phase.test.ts`: verify `onUsage` is called once per control with `controlName` set
    - `tests/tasks/split-phase.test.ts`: verify `onUsage` is called when the split branch runs, and NOT called when the file count is within limit
    - `tests/tasks/plan-phase.test.ts` (new, from Phase 2): verify `onUsage` is called once after `send()` resolves
    - `tests/tasks/synthesize-phases.test.ts` (new): minimal test verifying `onUsage` fires with correct `taskType`

    Use the existing mock pattern: `runner.run` as `vi.fn(async () => ({ text: '...', usage: { inputTokens: 10, outputTokens: 20, totalCostUsd: 0.001 } }))`. Add `onUsage: vi.fn()` to the adapters object. After calling the handler, assert `expect(adapters.onUsage).toHaveBeenCalledWith(expect.objectContaining({ taskType: '...', inputTokens: 10 }))`.

13. Run `npm run format` and `npm test` — all tests must pass before considering the phase complete.

---

## Technical Notes

- `runner.run()` returns `Promise<RunResult>` where `RunResult.usage` is `{ inputTokens, outputTokens, totalCostUsd }` — already present in `@helentherobot/runner`, no runner changes needed.
- `send()` returns `Promise<SendResult>` where `SendResult.usage` has the same shape — aggregate across all agentic steps, which is the correct granularity (one `onUsage` call per `send()` invocation).
- `check-phase` and `investigate-phase` use `Promise.all` over controls — `onUsage` may be invoked concurrently. Callers accumulating totals must be prepared for concurrent callbacks (simple counter/accumulator is fine).
- The `OtherPhaseContext.fileIndex` field name is chosen to avoid collision with the numeric `index` field on the same object. `PhaseState.index` (the file list string) is a pre-existing field name that can't be changed.
- `vagueness-check.ts` does not need updating — cross-phase context is irrelevant to within-phase vagueness detection.
- The `run.test.ts` mock includes a `config` field inside `makeState()` that doesn't match the current `PlanState` type. This appears to be a stale test artifact — it doesn't block this feature but should be cleaned up in a follow-on.

## Files Modified/Created

### Services / Core

- `src/types.ts` — add `OtherPhaseContext`, `UsageEvent`; extend `ControlRecipeContext` with `otherPhases`; extend `Adapters` with `onUsage?`
- `src/helpers.ts` — add `usageCtx` parameter to `runRecipe`; fire `onUsage` after `runner.run()` resolves

### Tasks

- `src/tasks/plan-phase.ts` — compute `otherPhases`, prepend cross-phase block to user message, call `onUsage` after `send()`
- `src/tasks/check-phase.ts` — compute `otherPhases`, thread into `runRecipe` context and `usageCtx`
- `src/tasks/investigate-phase.ts` — add `usageCtx` with `controlName` to `runRecipe` call
- `src/tasks/gather-recon.ts` — call `onUsage` after `send()`
- `src/tasks/synthesize-phases.ts` — add `usageCtx` to `runRecipe` call
- `src/tasks/normalize-phase-prompt.ts` — add `usageCtx` to `runRecipe` call
- `src/tasks/normalize-phase-plan.ts` — add `usageCtx` to `runRecipe` call
- `src/tasks/index-phase.ts` — add `usageCtx` to `runRecipe` call
- `src/tasks/split-phase.ts` — add `usageCtx` to `runRecipe` call
- `src/tasks/revise-phase.ts` — add `usageCtx` to `runRecipe` call

### Prompts

- `src/prompts/check-phase/scope-check.ts` — add `otherPhases` to destructuring, render cross-phase file section when present
- `src/prompts/check-phase/duplication-check.ts` — same pattern

### Tests

- `tests/tasks/plan-phase.test.ts` — new; covers cross-phase message injection and `onUsage` firing
- `tests/tasks/check-phase.test.ts` — update; add `otherPhases` propagation cases and `onUsage` with `controlName`
- `tests/tasks/split-phase.test.ts` — update; add `onUsage` firing/not-firing cases
- `tests/tasks/synthesize-phases.test.ts` — new; covers `onUsage` firing

## Progress

### Completed

- Research and planning

### In Progress

- Phase 1: Type system foundations

### To Do

- Phase 2: Cross-phase file awareness
- Phase 3: `onUsage` hook wiring

## Session History

### Session 1

- Planned both improvements from note 195 design
- Research confirmed: `runner.run()` and `send()` already carry `usage` data — no runner package changes needed
- Research confirmed: all existing `prompt()` functions destructure only `{ phaseState, controlState }` — adding `otherPhases` to `ControlRecipeContext` is purely additive
- No existing test file for `plan-phase` — needs creation in Phase 2
