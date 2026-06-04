# Interrogation

- Branch: `feature/003-interrogation`

## Overview

Helen Planner runs a long, fully-unattended planning pipeline that can take 20+ minutes. When the planner encounters ambiguity it cannot resolve from codebase recon alone, it silently assumes — producing phases that are confidently wrong rather than ones that surface the uncertainty. There is no mechanism to pause mid-run and ask a human; doing so would require the human to babysit the entire execution.

The feature adds two question moments — one structural gate after recon, one silent per-phase accumulator — both designed around unattended execution. A structural question pauses `run()` and returns control to the caller, which can collect answers from the human and resume. Per-phase questions are collected silently and included in the final state for the consuming application to surface after the plan is complete. A separate `revise()` function handles acting on answers post-plan: it re-runs affected phases with the answered question in context.

The design keeps the library's existing API shape as close as possible. `run()` gains a union return type. `revise()` is a new top-level export. The consuming application (Helen) decides how to surface and collect answers — the library only defines the mechanism.

### Background / Current Behavior

- **Current behavior**: `run(state, adapters, signal?)` returns `Promise<PlanState>` unconditionally. The planner runs to completion regardless of unknowns.
- **Problem**: Structural unknowns (things that would change the phase structure) and phase-specific unknowns (things that would change a phase's implementation plan) are silently assumed rather than surfaced.
- **Where it happens**: `src/run.ts` (main loop), `src/tasks/plan-phase.ts` (per-phase planning), `src/helpers.ts` (task sequence)
- **Impact**: Plans contain silent assumptions. Humans discover the problem during implementation, not during planning.

### Target Outcome

This feature will add a two-moment question mechanism and a post-plan revision function so that:

- The planner can pause after recon when structural unknowns are detected and return questions to the caller
- The caller can resume with answers that are threaded into every subsequent task's context
- Per-phase unknowns are collected silently and returned in the final state for the consuming app to surface
- The consuming app can call `revise()` with an answered question to re-run affected phases with the answer in context

## Requirements

### Functional

- [ ] `run()` returns `{ status: 'needs-answers'; questions: Question[]; state: PlanState }` when `gather-questions` produces structural questions; caller resumes by calling `run()` again with `options.answers`
- [ ] `run()` returns `{ status: 'complete'; state: PlanState }` on normal completion; `state.pendingQuestions` contains any unanswered phase-level questions
- [ ] `gather-phase-questions` runs silently after `plan-phase` for every phase (initial planning, split sub-phases, revision passes) and deduplicates against existing `pendingQuestions`
- [ ] `revise(state, adapters, question, answer, options?)` determines affected phases via a small-model LLM call, re-queues their pipeline tasks, runs the task loop, and returns updated state with the question moved from `pendingQuestions` to `answeredQuestions`
- [ ] `answeredQuestions` are threaded as context into `synthesize-phases`, `plan-phase`, and `revise-phase` prompts to prevent re-surfacing resolved questions

### Non-Functional

- [ ] Observability: `gather-questions` and `gather-phase-questions` report `onUsage` like all other recipe tasks
- [ ] Performance: both new recipe tasks use a small/fast model profile by default (configurable via `taskProfiles`)
- [ ] Backwards compatibility: callers treating `run()` as returning `Promise<PlanState>` will get a type error; the return type change is intentional and is the migration signal
- [ ] State is fully serialisable: `answeredQuestions`, `pendingQuestions`, and `awaitingQuestions` are plain JSON arrays — no class instances

### Out of Scope

- Deciding how to surface questions to the human (that belongs in the consuming application, e.g. Helen)
- Fuzzy deduplication of phase questions (exact-match normalisation is sufficient for now)
- Automatic resumption after a `needs-answers` pause (the consuming app is responsible for collecting answers and calling `run()` again)

## Implementation Plan

> **Code style**: No useless comments. Only add comments that explain tricky/non-obvious code.
> **Before committing**: Run `npm run format` and `npm test` before every commit.
> **No auto-committing**: Only commit when explicitly asked.
> **One step at a time**: Complete only the current step before proceeding. Do not work ahead.

---

### Phase 1 — Types & State Foundations

Lay down all new types and extend `PlanState`. No behaviour changes. Tests verify the type shapes and that `createInitialState()` produces the correct zero values.

**Step 1.1 — Add new types to `src/types.ts`**

Add the following interfaces in a new section after the existing `Task` interface:

```ts
export interface Question {
  id: string // assigned by task handler; format: 'recon-0', 'recon-1', etc.
  question: string
  context?: string // why the model is asking — shown to the human, critical for answerability
}

export interface PhaseQuestion extends Question {
  phaseIndex: number | number[] // number[] when merged across phases during deduplication
}

export interface AnsweredQuestion extends Question {
  answer: string
  phaseIndex?: number | number[] // present for phase questions moved to answeredQuestions by revise()
}

export interface Answer {
  questionId: string
  answer: string
}
```

**Step 1.2 — Extend `PlanState` in `src/types.ts`**

Add three fields to the `PlanState` interface:

```ts
awaitingQuestions: Question[]    // structural questions from gather-questions; cleared on resume
answeredQuestions: AnsweredQuestion[]
pendingQuestions: PhaseQuestion[]
```

`awaitingQuestions` is the structural pause signal: when non-empty after `gather-questions`, `run()` returns early with `needs-answers`. It is cleared when `run()` resumes with answers.

**Step 1.3 — Update `createInitialState()` in `src/helpers.ts`**

Add the three new fields, all initialised to `[]`:

```ts
awaitingQuestions: [],
answeredQuestions: [],
pendingQuestions: [],
```

**Step 1.4 — Tests**

- `tests/types.test.ts`: update the `PlanState` assignability test to include the three new fields. Confirm a valid state object compiles and an object missing the new fields fails assignability.
- Update `makeState()` in `tests/run.test.ts` to include the three new fields (all `[]`). Also fix the stale `config` field on that helper's state object — `config` belongs on `Adapters`, not `PlanState`.
- Check any other test files whose `makeState` helper constructs `PlanState` directly (e.g. `tests/tasks/synthesize-phases.test.ts`, `tests/tasks/collect-feedback.test.ts`, `tests/tasks/check-phase.test.ts`, `tests/tasks/plan-phase.test.ts`, `tests/tasks/split-phase.test.ts`) and add the three new fields there too.

---

### Phase 2 — `run()` API + `gather-questions` Task

Change `run()`'s return type to a union, add the options bag, slot `gather-questions` into the task sequence, and implement the task + recipe.

**Step 2.1 — Add `RunResult` and `RunOptions` types to `src/types.ts`**

```ts
export type RunResult =
  | { status: 'complete'; state: PlanState }
  | { status: 'needs-answers'; questions: Question[]; state: PlanState }

export interface RunOptions {
  signal?: AbortSignal
  answers?: Answer[]
}
```

**Step 2.2 — Update `run()` signature and return type in `src/run.ts`**

Change:

```ts
async function run(state: PlanState, adapters: Adapters, signal?: AbortSignal): Promise<PlanState>
```

To:

```ts
async function run(state: PlanState, adapters: Adapters, options?: RunOptions): Promise<RunResult>
```

**Step 2.3 — Answers injection at the top of `run()`**

Before the task loop begins, if `options?.answers` is provided:

- For each `answer` in `options.answers`, find the matching question in `current.awaitingQuestions` by `questionId`
- Append it (merged with the answer) to `current.answeredQuestions`
- Clear `current.awaitingQuestions = []`
- Persist with `adapters.store.write(current)`

This ensures that when `run()` is called a second time after a `needs-answers` pause, the answers are part of state before any task runs.

**Step 2.4 — Needs-answers early exit in the `run()` loop**

After each task handler returns, add a check:

```ts
if (current.awaitingQuestions.length > 0) {
  return { status: 'needs-answers', questions: current.awaitingQuestions, state: current }
}
```

Do NOT call `observer.complete()` on this path.

**Step 2.5 — Wrap the normal completion return**

Change the final `return current` at the bottom of `run()` to:

```ts
return { status: 'complete', state: current }
```

**Step 2.6 — Update the `AbortSignal` handling**

The existing signal check inside the loop used `signal?.aborted`. Change to read `options?.signal?.aborted`.

**Step 2.7 — Insert `gather-questions` into the initial task sequence (`src/helpers.ts`)**

In `createInitialState()`, the `remainingTasks` seed currently is:

```ts
;[{ type: 'gather-recon' }, { type: 'synthesize-phases' }]
```

Change to:

```ts
;[{ type: 'gather-recon' }, { type: 'gather-questions' }, { type: 'synthesize-phases' }]
```

**Step 2.8 — Create `src/prompts/gather-questions/recipe.ts`**

A `runRecipe()`-style recipe. Context shape:

```ts
{ brief: string; recon: string; answeredQuestions: AnsweredQuestion[] }
```

Prompt instruction: review the brief and recon and identify questions that would materially change the phase structure of the plan. Bar is high — only ask questions that, if answered differently, would produce different phases or a different phase ordering. Questions that affect only a single phase's implementation details are out of scope here. Return JSON: `{ "questions": [] }` (no questions, continue) or `{ "questions": [{ "question": "...", "context": "..." }] }`.

Include `answeredQuestions` as a "these are already resolved — do not re-ask" section. If `answeredQuestions` is non-empty, format them as:

```
## Already resolved
Q: ...
A: ...
```

**Step 2.9 — Create `src/tasks/gather-questions.ts`**

Handler signature: `handleGatherQuestions(task, state, adapters): Promise<PlanState>`

Steps:

1. Call `runRecipe(adapters, recipe, { brief: state.brief, recon: state.recon, answeredQuestions: state.answeredQuestions })` using the `gather-questions` recipe
2. Parse `result.text` as JSON; extract the `questions` array
3. Assign IDs: `recon-0`, `recon-1`, etc. (based on index)
4. If `questions.length === 0`: return `state` unchanged (no questions, no pause)
5. If `questions.length > 0`: return `{ ...state, awaitingQuestions: questions }`
   - Do NOT add to `pendingQuestions` — these are structural, not phase-level
   - The run loop detects `awaitingQuestions.length > 0` and returns `needs-answers`

**Step 2.10 — Register the handler in `src/run.ts`**

Add to the `handlers` record:

```ts
'gather-questions': handleGatherQuestions,
```

**Step 2.11 — Export `RunResult` and `RunOptions` from `src/index.ts`**

Add to the re-exports:

```ts
export type { RunResult, RunOptions } from './types.js'
```

**Step 2.12 — Tests**

- `tests/tasks/gather-questions.test.ts`: new file. Test cases:
  - When recipe returns `{ questions: [] }` → state returned unchanged, `awaitingQuestions` remains `[]`
  - When recipe returns questions → `awaitingQuestions` is set with correct IDs (`recon-0`, etc.), `pendingQuestions` unchanged
  - `onUsage` is called with the recipe's usage
  - Mock `runner.run` inline (same pattern as `synthesize-phases.test.ts`)

- `tests/run.test.ts`: add/update test cases:
  - When `gather-questions` sets `awaitingQuestions` → `run()` returns `{ status: 'needs-answers', questions: [...] }`; `observer.complete` is NOT called
  - When `run()` is called with `options.answers` → answers are merged into `answeredQuestions`, `awaitingQuestions` is cleared, loop continues
  - Normal completion still returns `{ status: 'complete', state }`
  - Update any existing tests that call `run()` and assert on the returned value — they now receive `RunResult`, so `result.state` replaces raw `result`

---

### Phase 3 — `gather-phase-questions` Task

Implement the silent per-phase question accumulator with deduplication, insert it into `phaseTaskOrder`, and ensure it also fires after revision passes.

**Step 3.1 — Create `src/prompts/gather-phase-questions/recipe.ts`**

A `runRecipe()`-style recipe. Context shape:

```ts
{
  phaseIndex: number
  phaseState: PhaseState
  brief: string
  recon: string
  answeredQuestions: AnsweredQuestion[]
  existingPendingQuestions: PhaseQuestion[]
}
```

Prompt instruction: review the phase's implementation plan and identify questions that, if answered, would improve or correct the plan. These questions will be collected and presented to the human after planning completes — they do not pause execution. Exclude anything already resolved in `answeredQuestions`. Exclude anything already present in `existingPendingQuestions` (include the text of existing questions so the model can avoid re-stating them). Return JSON: `{ "questions": [] }` or `{ "questions": [{ "question": "...", "context": "..." }] }`.

**Step 3.2 — Create `src/tasks/gather-phase-questions.ts`**

Handler signature: `handleGatherPhaseQuestions(task, state, adapters): Promise<PlanState>`

The `task` object carries `task.phase: number` (same convention as all other phase tasks).

Steps:

1. Call `runRecipe(...)` with the `gather-phase-questions` recipe
2. Parse result; extract `questions` array
3. If empty, return state unchanged
4. Assign IDs: `${task.phase}-0`, `${task.phase}-1`, etc. (offset from `state.pendingQuestions.length` so IDs are unique across phases)
5. Tag each question with `phaseIndex: task.phase`
6. Deduplicate: for each new question, check `state.pendingQuestions` for an exact match on the normalised `question` string (lowercase + trim). If matched, merge `phaseIndex` into an array on the existing entry (e.g. `[0, 2]`) rather than appending a duplicate.
7. Append non-duplicate new questions to `state.pendingQuestions`
8. Return updated state

**Step 3.3 — Insert into `phaseTaskOrder` in `src/helpers.ts`**

```ts
export const phaseTaskOrder: string[] = [
  'normalize-phase-prompt',
  'plan-phase',
  'gather-phase-questions', // ← new, after plan-phase
  'normalize-phase-plan',
  'index-phase',
  'split-phase',
  'check-phase',
  'collect-feedback',
]
```

Because `handleSplitPhase` imports `phaseTaskOrder` directly and uses it to regenerate tasks for sub-phases, this change automatically applies to split phases — no change to `split-phase.ts` needed.

**Step 3.4 — Re-inject after revision passes in `src/tasks/collect-feedback.ts`**

When `collect-feedback` re-queues tasks for a revision pass (the `anyRaised && nextIterations < maximumIterations` branch), the current inject is:

```
revise-phase → check-phase → collect-feedback
```

Change to:

```
revise-phase → gather-phase-questions → check-phase → collect-feedback
```

This ensures phase questions are refreshed after each revision. The deduplication logic in the handler prevents duplicates.

**Step 3.5 — Register the handler in `src/run.ts`**

```ts
'gather-phase-questions': handleGatherPhaseQuestions,
```

**Step 3.6 — Tests**

- `tests/tasks/gather-phase-questions.test.ts`: new file. Test cases:
  - Recipe returns `{ questions: [] }` → state unchanged
  - Recipe returns questions → appended to `pendingQuestions` with correct `phaseIndex` and IDs
  - Deduplication: exact-match question already in `pendingQuestions` → `phaseIndex` merged, no duplicate appended
  - Near-identical (different casing/whitespace) → normalised to same key, merged
  - `onUsage` called with recipe usage
  - `store.write` called with updated state

- `tests/expand-phases.test.ts`: verify the updated `phaseTaskOrder` ordering (ensure `gather-phase-questions` appears between `plan-phase` and `normalize-phase-plan`)

- `tests/tasks/collect-feedback.test.ts`: add a test case asserting that the revision re-queue includes `gather-phase-questions` between `revise-phase` and `check-phase`

---

### Phase 4 — `revise()` Export

Implement the separate `revise()` function with phase-spread LLM call, task queuing, and run loop reuse.

**Step 4.1 — Extract the task loop from `src/run.ts`**

Extract the `while (current.remainingTasks.length > 0)` loop body into an unexported helper:

```ts
async function drainTasks(
  initial: PlanState,
  adapters: Adapters,
  options?: RunOptions,
): Promise<RunResult>
```

This helper contains:

- The answers-injection block (from Phase 2.3)
- The `while` loop
- The `needs-answers` early-exit check (Phase 2.4)
- The `observer.update` and `store.write` calls after each task
- Returns `RunResult`

`run()` becomes a thin wrapper that calls `observer.start(...)` then delegates to `drainTasks`, then calls `observer.complete()` on the `complete` path only.

**Step 4.2 — Create `src/prompts/revise-determine-phases/recipe.ts`**

A `runRecipe()`-style recipe (small model — default profile should be configurable via `taskProfiles` key `'revise-spread'`). Context shape:

```ts
{
  question: Question
  answer: string
  directPhaseIndex: number | number[]   // phases already known to be affected (from the question)
  phaseTitles: Array<{ index: number; title: string }>
}
```

Prompt instruction: given the answered question and the list of phase titles, determine which phases (if any, beyond the ones already identified) would benefit from revision in light of this answer. Be conservative — only include phases where the answer would materially change the implementation plan. Return JSON: `{ "additionalPhases": [] }` or `{ "additionalPhases": [2, 4] }`.

**Step 4.3 — Create `src/revise.ts`**

```ts
export async function revise(
  state: PlanState,
  adapters: Adapters,
  question: PhaseQuestion,
  answer: string,
  options?: { signal?: AbortSignal },
): Promise<PlanState>
```

Steps:

1. **Phase-spread call**: call `runRecipe` with the `revise-determine-phases` recipe, passing the question, answer, the question's `phaseIndex` as `directPhaseIndex`, and `state.phases.map((p, i) => ({ index: i, title: p.title }))` as `phaseTitles`. Parse result to get `additionalPhases`.

2. **Compute full affected set**: merge `question.phaseIndex` (flattened to `number[]`) with `additionalPhases`. Deduplicate. Sort ascending.

3. **Guard against double-queuing**: for each affected phase index, check whether that phase's tasks are already present in `state.remainingTasks`. Skip if already queued (to handle resumption after interruption).

4. **Build task list for affected phases**: for each affected phase index (in ascending order), generate the full `phaseTaskOrder` task list for that phase (same format as `expandPhases` — `{ type, phase: phaseIndex }` for each entry in `phaseTaskOrder`). Prepend to `state.remainingTasks`.

   Do NOT append a new `cleanup` task — one already exists in `remainingTasks` or `completedTasks`.

5. **Move question to answeredQuestions**: remove the question from `state.pendingQuestions` (match by `id`). Append `{ ...question, answer }` to `state.answeredQuestions`.

6. **Persist updated state**: call `adapters.store.write(current)`.

7. **Drain the task loop**: call `drainTasks(current, adapters, { signal: options?.signal })`.

8. **Return**: on `complete`, return `result.state`. On `needs-answers` (should not occur — `gather-questions` is a top-level one-time task), throw an error (unexpected state).

**Step 4.4 — Export from `src/index.ts`**

```ts
export { revise } from './revise.js'
```

**Step 4.5 — Tests**

- `tests/revise.test.ts`: new file. Test cases:
  - Phase-spread recipe is called with correct context (question, answer, affected phase indices, phase titles)
  - `additionalPhases` from recipe are merged with `question.phaseIndex`; all merged phases get tasks prepended
  - Question is moved from `pendingQuestions` to `answeredQuestions` with the answer attached
  - `store.write` is called before the loop starts
  - Already-queued phases are not double-queued (idempotency / resumption test)
  - Task loop is called and final state is returned
  - `onUsage` is called for the phase-spread recipe
  - Mock `runner.run` inline for the phase-spread recipe; mock `drainTasks` or mock the handlers for the per-phase tasks (depending on implementation — if `drainTasks` is unexported, mock the task handlers via the `handlers` record or use the existing approach of mocking `runner.run` for each recipe)

---

### Phase 5 — Context Threading

Thread `answeredQuestions` into the prompts for `synthesize-phases`, `plan-phase`, and `revise-phase` so that resolved questions are treated as settled decisions.

**Step 5.1 — `synthesize-phases` task and recipe**

In `src/tasks/synthesize-phases.ts`, update the `runRecipe` call to pass `answeredQuestions: state.answeredQuestions`.

In `src/prompts/synthesize-phases/recipe.ts`, update the context type and prompt string:

- If `answeredQuestions` is non-empty, prepend a section:
  ```
  ## Resolved decisions
  The following questions have been answered — treat these as settled decisions when designing phases:
  Q: [question]
  A: [answer]
  ...
  ```
- If empty, omit the section entirely.

**Step 5.2 — `plan-phase` task**

In `src/tasks/plan-phase.ts`, update the inline `userMessage` assembly. After building `crossPhaseBlock`, build an `answeredQuestionsBlock`:

```ts
const answeredQuestionsBlock =
  state.answeredQuestions.length > 0
    ? [
        '## Resolved decisions',
        'The following questions have been answered — treat these as settled decisions:',
        ...state.answeredQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`),
        '',
      ].join('\n')
    : ''
```

Prepend `answeredQuestionsBlock` to `userMessage` (before `crossPhaseBlock`).

**Step 5.3 — `revise-phase` task and recipe**

In `src/tasks/revise-phase.ts`, update the `runRecipe` call to pass `answeredQuestions: state.answeredQuestions`.

In `src/prompts/revise-phase/recipe.ts`, update the context type and prompt string — same pattern as `synthesize-phases`: include a "Resolved decisions" section when `answeredQuestions` is non-empty.

**Step 5.4 — `normalize-phase-prompt` task and recipe (optional but recommended)**

`normalize-phase-prompt` rewrites a phase title into the detailed prompt that `plan-phase` uses as its user message. If `answeredQuestions` are not in this prompt, they must be injected by `plan-phase` separately (Step 5.2). Consider also adding the resolved-decisions block to `normalize-phase-prompt`'s recipe so the normalised prompt itself embeds the context — meaning `plan-phase` would receive it naturally through `phaseState.prompt`. Whether to do both or just one is a judgment call; doing both is redundant but safe.

Decision: add to `normalize-phase-prompt` too. Redundancy is preferable to a missed context path.

**Step 5.5 — Tests**

- `tests/tasks/synthesize-phases.test.ts`: add test cases:
  - When `state.answeredQuestions` is non-empty, `runner.run` is called with a prompt containing the resolved decisions section
  - When `state.answeredQuestions` is empty, the section is absent
- `tests/tasks/plan-phase.test.ts`: add test cases:
  - When `state.answeredQuestions` is non-empty, `send` is called with a `userMessage` containing the answered questions block
  - When `state.answeredQuestions` is empty, the block is absent

- `tests/tasks/revise-phase.test.ts`: add test cases:
  - When `state.answeredQuestions` is non-empty, `runner.run` is called with a prompt containing the resolved decisions section
  - When `state.answeredQuestions` is empty, the section is absent

## Progress

### Completed

- Feature branch and worktree created
- Planning complete
- Phase 1: Types & State Foundations
- Phase 2: `run()` API + `gather-questions` task
- Phase 3: `gather-phase-questions` task
- Phase 4: `revise()` export
- Phase 5: Context threading

### In Progress

_None_

### Blocked

_None_

### To Do

_None_

## Technical Notes

### Why three separate question fields on `PlanState`?

- `awaitingQuestions`: the structural pause signal. Non-empty means `run()` has not yet resumed with answers. Cleared when answers arrive.
- `pendingQuestions`: per-phase questions collected silently during planning. Populated by `gather-phase-questions`. Never causes a pause. Read by the consuming app after planning.
- `answeredQuestions`: resolved Q&A pairs. Written by both `run()` (structural answers on resume) and `revise()` (phase answers when calling revise). Threaded into prompts.

The three-field design keeps the pause signal distinct from the accumulator, and both distinct from the resolved set. This makes the state machine clear at a glance.

### Why `drainTasks()` extraction?

`revise()` must re-use the same task-dispatch loop as `run()`, but without firing `observer.start` or `observer.complete` (those are run-level lifecycle events, not loop-level). Extracting the inner loop prevents duplication and keeps lifecycle management at the right level.

### `phaseTaskOrder` is the source of truth for task queuing

Both `expandPhases()`, `handleSplitPhase`, and `revise()` must all use `phaseTaskOrder` to generate per-phase task lists. Do not hardcode task names anywhere else.

### Deduplication key for `gather-phase-questions`

Exact match after `question.trim().toLowerCase()`. Semantically equivalent questions with different wording are not merged (acceptable for now). The main benefit is preventing the same question from accumulating across multiple revision passes of the same phase.

## Files Modified/Created

### Services / Core

- `src/types.ts` — add `Question`, `PhaseQuestion`, `AnsweredQuestion`, `Answer`, `RunResult`, `RunOptions`; extend `PlanState`
- `src/helpers.ts` — update `createInitialState()`, `phaseTaskOrder`
- `src/run.ts` — update `run()` signature/return type; extract `drainTasks()`; register new handlers
- `src/tasks/gather-questions.ts` — new
- `src/prompts/gather-questions/recipe.ts` — new
- `src/tasks/gather-phase-questions.ts` — new
- `src/prompts/gather-phase-questions/recipe.ts` — new
- `src/tasks/collect-feedback.ts` — add `gather-phase-questions` to revision re-queue
- `src/revise.ts` — new
- `src/prompts/revise-determine-phases/recipe.ts` — new
- `src/tasks/synthesize-phases.ts` — thread `answeredQuestions`
- `src/prompts/synthesize-phases/recipe.ts` — add resolved decisions section
- `src/tasks/plan-phase.ts` — thread `answeredQuestions` into userMessage
- `src/tasks/revise-phase.ts` — thread `answeredQuestions`
- `src/prompts/revise-phase/recipe.ts` — add resolved decisions section
- `src/tasks/normalize-phase-prompt.ts` — thread `answeredQuestions`
- `src/prompts/normalize-phase-prompt/recipe.ts` — add resolved decisions section
- `src/index.ts` — export `revise`, `RunResult`, `RunOptions`

### Tests

- `tests/types.test.ts` — update PlanState assignability test
- `tests/run.test.ts` — update for new return type; add needs-answers and resume tests; fix stale `config` in `makeState`
- `tests/expand-phases.test.ts` — verify updated `phaseTaskOrder`
- `tests/tasks/gather-questions.test.ts` — new
- `tests/tasks/gather-phase-questions.test.ts` — new
- `tests/tasks/collect-feedback.test.ts` — assert `gather-phase-questions` in revision re-queue
- `tests/tasks/synthesize-phases.test.ts` — assert `answeredQuestions` threading
- `tests/tasks/plan-phase.test.ts` — assert `answeredQuestions` threading
- `tests/tasks/revise-phase.test.ts` — assert `answeredQuestions` threading
- `tests/revise.test.ts` — new

## Testing

⬜ **Not started**: No tests written yet.

## Questions/Decisions Needed

- [ ] Should `normalize-phase-prompt` also receive `answeredQuestions`? (Plan says yes — belt-and-suspenders approach)
- [ ] Should `revise()` call `observer.start` / `observer.complete`? (Plan says no — those are `run()`-level lifecycle events)
- [ ] What profile key should `gather-questions` and `gather-phase-questions` use in `taskProfiles`? (Suggest: `'gather-questions'` and `'gather-phase-questions'`)

## Decisions Made

- `awaitingQuestions`, `answeredQuestions`, and `pendingQuestions` are three distinct fields — see Technical Notes
- Deduplication of phase questions uses exact match after normalisation (trim + lowercase)
- `gather-phase-questions` re-fires after revision passes (injected by `collect-feedback`)
- The task loop is extracted into `drainTasks()` to allow `revise()` to reuse it without re-firing observer lifecycle events
- `revise()` operates on a single question+answer pair — the consuming app calls it once per answer

## Session History

### Session 1

- Feature branch and worktree created

### Session 2

- Planning complete — full phased implementation plan written to feature doc
