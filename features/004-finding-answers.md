# Finding Answers

- Branch: `feature/004-finding-answers`

## Overview

Helen's planning pipeline collects open questions during phase planning via `gather-phase-questions`. These questions accumulate in `pendingQuestions` and either get surfaced to the user (moved to `awaitingQuestions`) or stay unresolved until the user manually answers them. Many of these questions, however, have answers that already exist in the codebase — in `CLAUDE.md`, `README.md`, or source files — but the planner doesn't know that.

The problem is that the user must answer every single pending question even when the answers are trivially discoverable. This creates unnecessary friction and slows the planning loop.

This feature adds a new `resolve-phase-questions` task that runs after `gather-phase-questions` and uses an agent loop (with file tools) to auto-answer any questions whose answers are **unambiguously present in the codebase**. Questions that can't be answered with certainty remain pending but may be enriched with relevant excerpts, giving the user better context when they do need to answer manually.

### Background / Current Behavior

- **Current behavior**: `gather-phase-questions` appends questions to `pendingQuestions`. They stay there until `collect-feedback` decides to surface them as `awaitingQuestions` or the user answers them via the CLI.
- **Problem**: Questions that have obvious answers in the codebase are still surfaced to the user, creating unnecessary round-trips.
- **Where it happens**: `src/tasks/gather-phase-questions.ts`, `src/tasks/collect-feedback.ts`, `src/helpers.ts`
- **Impact**: Users must answer questions that don't need answering; planning loops take longer than necessary.

### Target Outcome

This feature will add `resolve-phase-questions` to the planning pipeline so that Helen can:

- Auto-answer pending questions that are unambiguously resolved by codebase files
- Enrich unanswered questions with relevant excerpts found during the search
- Never auto-resolve upfront questions (`awaitingQuestions`) — those remain user-only

## Requirements

### Functional

- [ ] New task `resolve-phase-questions` runs after `gather-phase-questions` in `phaseTaskOrder`
- [ ] Agent searches CLAUDE.md, README.md, and source files with file tools
- [ ] Questions answered with certainty are moved from `pendingQuestions` to `answeredQuestions`
- [ ] Questions found but not certain are left pending with an enriched `context` field
- [ ] Questions with no relevant findings are left untouched
- [ ] Upfront questions (`awaitingQuestions`) are never touched by this task
- [ ] If no pending questions exist for the current phase, the handler returns state unchanged without calling the LLM
- [ ] `onUsage` is called with `taskType: 'resolve-phase-questions'` and accurate token counts
- [ ] Graceful fallback on malformed LLM JSON — return state unchanged

### Non-Functional

- [ ] Observability: `onUsage` hook fires with token counts and cost per run
- [ ] Performance: handler exits immediately (no LLM call) when there are no questions for the phase
- [ ] Backwards compatibility: no new exported types; works with existing `PhaseQuestion` and `AnsweredQuestion`

### Out of Scope

- Auto-resolving `awaitingQuestions`
- Asking the user follow-up questions from within this task
- Surfacing questions to `awaitingQuestions` (that remains `collect-feedback`'s job)

## Implementation Plan

> Break into ordered steps. Each step should be independently reviewable.
> **Code style**: No useless comments. Only add comments that explain tricky/non-obvious code.
> **Before committing**: Run `npm run format` and `npm test` before every commit.
> **No auto-committing**: Only commit when explicitly asked. `git status`/`git diff`/`git log` are read-only — never follow them with `git add` or `git commit` unless Chris said "commit."
> **One step at a time**: When the implementation plan has numbered steps, complete only the current step before asking to proceed. Do not work ahead into future steps.
> **No verbose paths**: Do not specify the working directory in commands when it matches the current directory (e.g. no `git -C /path/to/project`).
> **Playground embeds**: Use `@playground(uuid, caption text)` — parentheses, NOT square brackets.

---

### Phase 1: Prompt module + task handler

**Goal**: Create the prompt module and the agent-style task handler. No wiring yet — the task won't be reachable from the pipeline until Phase 2.

#### Step 1.1 — Create `src/prompts/resolve-phase-questions/index.ts`

This module exports `systemPrompt: string` and `userMessage(args): string`. It follows the same convention as `plan-phase` (system prompt extracted to a module, user message built from args).

The handler calls `send()` once **per question** — so the prompt module deals with a single question at a time, not a list.

`systemPrompt` must communicate:

- The agent's job: search the codebase to find the answer to one specific planning question
- The confidence bar: only answer if the codebase makes it unambiguous. Inferred or likely answers do not qualify.
- The enrichment path: if relevant information was found but the answer is still uncertain, return it as context but do not answer
- If nothing relevant was found, return `{ "result": "none" }`
- File tool usage guidance: start with CLAUDE.md and README.md, then explore as needed
- Output text must be plaintext, not markdown — the answer and context fields in the JSON response are plain prose; no headings, no bullet points, no backticks, no bold or italic markers. This is measurably faster on small models.

The prompt body itself must not contain markdown syntax — no `##` headings, no `**bold**`, no backtick fences. Bullet lists with `-` are fine. Small models mirror the style of their instructions.

`userMessage(args)` accepts a **single question** plus its surrounding context:

```ts
{
  phaseIndex: number
  phaseTitle: string
  phaseBrief: string
  brief: string                       // original plan brief
  recon: string                       // gathered recon
  question: PhaseQuestion             // the single question to research
  answeredQuestions: AnsweredQuestion[]  // already answered, for context
}
```

It formats a plain-text message describing the phase, listing any previously answered questions for context, then presenting the single question to investigate. The expected output JSON has three possible shapes:

```json
{ "result": "answered", "answer": "The project uses Drizzle ORM, confirmed in CLAUDE.md line 12." }
{ "result": "enriched", "context": "Found in README.md: 'Auth is handled by NextAuth'..." }
{ "result": "none" }
```

#### Step 1.2 — Create `src/tasks/resolve-phase-questions.ts`

Handler signature (same as all other handlers):

```ts
export async function handleResolvePhaseQuestions(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState>
```

**Flow:**

1. Filter `state.pendingQuestions` for questions relevant to `task.phase`:
   ```ts
   const phaseQuestions = state.pendingQuestions.filter((q) =>
     Array.isArray(q.phaseIndex)
       ? q.phaseIndex.includes(task.phase)
       : q.phaseIndex === task.phase,
   )
   ```
2. If `phaseQuestions.length === 0`, return `state` immediately — no LLM call.

3. Get the current phase state:

   ```ts
   const phase = state.phases[task.phase]
   ```

4. Resolve tools and profile once, before the loop:

   ```ts
   const tools = resolveTools(adapters, task.type)
   const profile = resolveProfile(adapters, task.type)
   ```

5. Loop over each question, carrying a running `current` state snapshot (so that each iteration sees previously-answered questions in context):

   ```ts
   let current = state

   for (const question of phaseQuestions) {
     // build user message for this single question
     // call send()
     // parse result
     // apply mutation to current
     // accumulate usage
   }
   ```

6. Inside the loop — build the user message:

   ```ts
   const userMsg = userMessage({
     phaseIndex: task.phase,
     phaseTitle: phase.title,
     phaseBrief: phase.brief,
     brief: current.brief,
     recon: current.recon,
     question,
     answeredQuestions: current.answeredQuestions,
   })
   ```

7. Call `send()` for this single question:

   ```ts
   const result = await send(
     adapters.tools.runner,
     { profile, systemPrompt, tools, maxSteps: 20 },
     [userMsg],
   )
   ```

8. Extract the last assistant text from `result.messages` (standard pattern from `plan-phase.ts`/`gather-recon.ts`).

9. Strip markdown fences if present — use the same strip helper as `gather-phase-questions.ts` if one exists, or inline the regex.

10. Parse as JSON. On failure (malformed JSON), log a warning and leave `current` unchanged for this iteration — continue the loop.

11. Apply per-question mutation to `current`:

    ```ts
    if (parsed.result === 'answered') {
      current = {
        ...current,
        pendingQuestions: current.pendingQuestions.filter(
          (q) => q.id !== question.id,
        ),
        answeredQuestions: [
          ...current.answeredQuestions,
          { ...question, answer: parsed.answer },
        ],
      }
    } else if (parsed.result === 'enriched') {
      current = {
        ...current,
        pendingQuestions: current.pendingQuestions.map((q) =>
          q.id === question.id ? { ...q, context: parsed.context } : q,
        ),
      }
    }
    // 'none' → no mutation
    ```

12. Accumulate usage from `result` and call `adapters.onUsage?.()` **once per iteration** (same pattern as `gather-recon.ts` if it calls onUsage per send call, otherwise accumulate and call once after the loop — confirm by checking the existing pattern).

13. Return `current`.

**Imports needed:**

- `import type { Task, PlanState, Adapters, AnsweredQuestion } from '../types.js'`
- `import { resolveTools, resolveProfile } from '../helpers.js'`
- `import { send } from '@helentherobot/runner/session'` (or whichever export path is used by other tasks — confirm by checking `gather-recon.ts`)
- `import { systemPrompt, userMessage } from '../prompts/resolve-phase-questions/index.js'`

#### Step 1.3 — Unit tests: `tests/tasks/resolve-phase-questions.test.ts`

Use Vitest. Follow the exact structure of `tests/tasks/gather-phase-questions.test.ts`:

- `makePhaseState()` factory
- `makeState(overrides?)` factory with all `PlanState` fields
- `makeStore(state)` factory — `read: vi.fn(() => stored)`, `write: vi.fn((s) => { stored = s })`
- `makeAdapters(state, runnerResult)` — runner mock is `{ run: vi.fn(async () => runnerResult) }`

Test cases:

1. **No pending questions for this phase** → returns state unchanged, runner is never called
2. **`{ "result": "answered" }` for one question** → removed from `pendingQuestions`, added to `answeredQuestions` with correct shape; `phaseIndex` is preserved on the `AnsweredQuestion`
3. **`{ "result": "enriched" }` for one question** → `context` updated on the pending question, still in `pendingQuestions`, not in `answeredQuestions`
4. **Two questions: first answered, second enriched** → runner called twice; both mutations applied; `answeredQuestions` in the second call's context includes the first answer
5. **`{ "result": "none" }` for a question** → state unchanged for that question, loop continues
6. **Question with `phaseIndex` as an array** → included in the loop; `phaseIndex` array preserved on `AnsweredQuestion` after answer
7. **`onUsage` is called** → construct adapters inline with an `onUsage` spy; assert called once per question with `taskType: 'resolve-phase-questions'` and numeric token counts
8. **Malformed JSON on one iteration** → that question left unchanged; loop continues; subsequent questions still processed; no throw

---

### Phase 2: Wiring & integration

**Goal**: Slot the new handler into the pipeline so it's reachable at runtime.

#### Step 2.1 — `src/helpers.ts`: add to `phaseTaskOrder`

Current array (verbatim, pre-this-branch):

```ts
export const phaseTaskOrder: string[] = [
  'normalize-phase-prompt',
  'plan-phase',
  'gather-phase-questions',
  'normalize-phase-plan',
  'index-phase',
  'split-phase',
  'check-phase',
  'collect-feedback',
]
```

Move `'gather-phase-questions'` to after `'collect-feedback'` and append `'resolve-phase-questions'` immediately after it. Q&A runs once, after all iterations are done, before moving to the next phase.

New order:

```ts
export const phaseTaskOrder: string[] = [
  'normalize-phase-prompt',
  'plan-phase',
  'normalize-phase-plan',
  'index-phase',
  'split-phase',
  'check-phase',
  'collect-feedback',
  'gather-phase-questions', // ← runs once after the loop exits
  'resolve-phase-questions', // ← new, immediately after
]
```

#### Step 2.2 — `src/run.ts`: register handler

Add import (near `gather-phase-questions` import):

```ts
import { handleResolvePhaseQuestions } from './tasks/resolve-phase-questions.js'
```

Add to `handlers` map (near `'gather-phase-questions'` entry):

```ts
'resolve-phase-questions': handleResolvePhaseQuestions,
```

#### Step 2.3 — `src/tasks/collect-feedback.ts`: three changes

**Change A** — remove `gather-phase-questions` from the Branch 1 re-queue. It is currently there (lines 55–57) and should not be. Branch 1 becomes:

```ts
const tasks: Task[] = [
  ...(!reviseAlreadyQueued ? [{ type: 'revise-phase', phase } as Task] : []),
  ...(!checkAlreadyQueued ? [{ type: 'check-phase', phase } as Task] : []),
  ...(!collectAlreadyQueued
    ? [{ type: 'collect-feedback', phase } as Task]
    : []),
]
```

That is the only change to this file. Everything else stays as-is.

#### Step 2.4 — Update `tests/tasks/collect-feedback.test.ts`

The existing test at line 84 explicitly asserts the buggy behavior and must be updated:

**Existing test (wrong):**

```ts
it('queues revise-phase then gather-phase-questions then check-phase when issues are raised', async () => {
  // ...
  expect(result.remainingTasks[0]?.type).toBe('revise-phase')
  expect(result.remainingTasks[1]?.type).toBe('gather-phase-questions') // ← remove
  expect(result.remainingTasks[2]?.type).toBe('check-phase')
})
```

**Fix:** rename the test and remove the `gather-phase-questions` assertion:

```ts
it('queues revise-phase then check-phase when issues are raised', async () => {
  // ...
  expect(result.remainingTasks[0]?.type).toBe('revise-phase')
  expect(result.remainingTasks[1]?.type).toBe('check-phase')
  expect(result.remainingTasks.map((t) => t.type)).not.toContain(
    'gather-phase-questions',
  )
  expect(result.remainingTasks.map((t) => t.type)).not.toContain(
    'resolve-phase-questions',
  )
})
```

Add two new test cases:

1. **Q&A tasks survive the clean exit** — when `collect-feedback` exits cleanly (no issues raised, iterations >= minimum), `gather-phase-questions` and `resolve-phase-questions` already in `remainingTasks` are NOT removed by `withoutStalePhaseTasks`:

   ```ts
   it('does not strip gather-phase-questions or resolve-phase-questions on clean exit', async () => {
     const phase = makePhaseState({ iterations: 1 })
     const qaTask: Task = { type: 'gather-phase-questions', phase: 0 }
     const resolveTask: Task = { type: 'resolve-phase-questions', phase: 0 }
     const state = makeState([phase], [qaTask, resolveTask])
     const adapters = makeAdapters(state)

     const result = await handleCollectFeedback(task, state, adapters)

     expect(result.remainingTasks).toContainEqual(qaTask)
     expect(result.remainingTasks).toContainEqual(resolveTask)
   })
   ```

2. **Q&A tasks are never re-queued when issues are raised** — Branch 1 re-queue must not include them even when controls are raised:

   ```ts
   it('does not re-queue gather-phase-questions or resolve-phase-questions when issues are raised', async () => {
     const phase = makePhaseState({
       iterations: 1,
       controls: {
         vagueness: { dismissed: [], raised: ['Something is vague'] },
       },
     })
     const state = makeState([phase])
     const control: QualityControl = {
       name: 'vagueness',
       checkRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
       investigateRecipe: { profile: 'haiku', prompt: vi.fn(() => '') },
     }
     const adapters = makeAdapters(state, [control])

     const result = await handleCollectFeedback(task, state, adapters)

     expect(result.remainingTasks.map((t) => t.type)).not.toContain(
       'gather-phase-questions',
     )
     expect(result.remainingTasks.map((t) => t.type)).not.toContain(
       'resolve-phase-questions',
     )
   })
   ```

#### Step 2.5 — Add eval recipe for `collect-feedback` Q&A sequencing

Create `evaluations/recipes/collect-feedback-qa-sequencing.ts` to verify the end-to-end ordering.

The recipe should:

- Build a `PlanState` with one phase, a few `pendingQuestions` for that phase, and `remainingTasks` that include `gather-phase-questions` and `resolve-phase-questions` after `collect-feedback` (mirroring `phaseTaskOrder`)
- Invoke `handleCollectFeedback` with no raised controls and iterations >= minimum
- Assert that `gather-phase-questions` and `resolve-phase-questions` remain in `remainingTasks` after the call
- Then invoke `handleCollectFeedback` again with a raised control (simulate a revision cycle) and assert neither Q&A task appears in the newly prepended tasks
- Print a summary of what was queued in each scenario

Add `'collect-feedback-qa-sequencing'` to `evaluations/recipes/run-all.ts`.

---

### Phase 3: Eval recipe

**Goal**: Add an evaluation recipe so the new task can be manually exercised against a real LLM with real file tools.

#### Step 3.1 — Create `evaluations/recipes/resolve-phase-questions.ts`

Follow the exact structure of `evaluations/recipes/gather-phase-questions.ts`:

- Import `handleResolvePhaseQuestions` from `../../src/tasks/resolve-phase-questions.ts` (`.ts` extension — eval convention)
- Import `PlanState`, `PhaseState`, `Adapters` from `../../src/index.ts`
- Import `runner`, `defaultProfile`, `prompts` from `../config.ts`
- Guard: exit if no profile configured
- Build a realistic `PlanState` fixture with a few `pendingQuestions` for phase 0 — make the questions answerable from the repo's own `CLAUDE.md`/`README.md` so the eval is meaningful
- Build `adapters` with the real `runner`, a temp-file-backed store, no-op `observer`, real `config` values, empty `controls`
- Invoke: `await handleResolvePhaseQuestions({ type: 'resolve-phase-questions', phase: 0 }, state, adapters)`
- Print:
  - Which questions were answered (id + answer)
  - Which were enriched (id + new context)
  - Which remain untouched
  - Usage stats

#### Step 3.2 — Update `evaluations/recipes/run-all.ts`

Add `'resolve-phase-questions'` to the `recipes` array, after `'gather-phase-questions'`.

---

### Phase 4: Strengthen existing prompts with plaintext instructions

**Goal**: Audit and update all existing prompt modules so that any prompt requesting free-form text (or free-form text fields inside JSON) explicitly instructs the model to respond in plaintext — no markdown, no formatting characters. No logic changes; prompt text only.

Audit results from research:

**Free-text output prompts — missing explicit plaintext instruction (7 files):**

| File                                           | What it does                                             |
| ---------------------------------------------- | -------------------------------------------------------- |
| `src/prompts/gather-recon/system.ts`           | Recon agent — requests a concise multi-paragraph summary |
| `src/prompts/plan-phase/system.ts`             | Planning agent — requests a thorough implementation plan |
| `src/prompts/normalize-phase-plan/recipe.ts`   | Cleans up prose/formatting in a plan                     |
| `src/prompts/normalize-phase-prompt/recipe.ts` | Rewrites a phase preamble as an agent prompt             |
| `src/prompts/revise-phase/recipe.ts`           | Revises a phase plan to address confirmed issues         |
| `src/prompts/synthesize-phases/recipe.ts`      | Produces the initial ordered list of phase titles        |
| `src/prompts/index-phase/recipe.ts`            | Extracts a flat list of file paths from a plan           |

**JSON-output prompts with free-text fields — missing plaintext instruction on those fields (6 files, 8 fields):**

| File                                           | Free-text fields      |
| ---------------------------------------------- | --------------------- |
| `src/prompts/check-phase/duplication-check.ts` | `reason`              |
| `src/prompts/check-phase/scope-check.ts`       | `reason`              |
| `src/prompts/check-phase/vagueness-check.ts`   | `reason`              |
| `src/prompts/gather-phase-questions/recipe.ts` | `question`, `context` |
| `src/prompts/gather-questions/recipe.ts`       | `question`, `context` |
| `src/prompts/split-phase/recipe.ts`            | `title`, `brief`      |

Two rules apply to every prompt in this codebase:

1. **The prompt body itself must not contain markdown syntax.** No `##` headings, no `**bold**`, no `*italic*`, no backtick fences. Bullet lists with `-` are fine — they are plain text, not markdown. Small models mirror the style of their instructions, so markdown decorators in the prompt produce markdown decorators in the output.
2. **The prompt must explicitly instruct the model to respond in plaintext.** This must be an affirmative instruction, not just an absence of markdown in the prompt.

#### Step 4.1 — Update free-text output prompts

For each of the 7 files, make two changes:

**A. Strip markdown syntax from the prompt body.** Replace any `##`/`###` headings with plain capitalized text or a numbered prefix. Replace `**bold**` and `*italic*` with plain word choice. Remove backtick fences from examples where possible; if code examples are necessary, keep them but remove the fences. Bullet lists with `-` are fine and do not need changing.

**B. Add an explicit plaintext output instruction.** The exact wording should fit the existing prompt's voice, but must convey:

> "Respond in plain text only. Do not use markdown — no headings, no bullet points, no bold, no italic, no code fences."

Notes per file:

- `gather-recon/system.ts` and `plan-phase/system.ts` — system prompts for agentic tasks; add the plaintext instruction at the end as a standalone constraint.
- `normalize-phase-plan/recipe.ts`, `normalize-phase-prompt/recipe.ts`, `revise-phase/recipe.ts` — already say "Output only the …, nothing else"; append the plaintext constraint to that sentence.
- `synthesize-phases/recipe.ts` — already says "one per line, no descriptions"; add plaintext constraint to the output instruction.
- `index-phase/recipe.ts` — already highly constrained (one path per line); still add the explicit plaintext note.

#### Step 4.2 — Update JSON prompts with free-text fields

For each of the 6 JSON prompt files, make two changes:

**A. Strip markdown syntax from the prompt body** — same rules as Step 4.1A.

**B. Annotate each free-text field** in the JSON schema description with an inline plaintext note. Do NOT add a global plaintext instruction (the JSON wrapper itself must remain valid JSON):

> `"question"` — the question text, as a plain prose sentence. No markdown.
> `"context"` — additional context, plain prose only. No markdown.
> `"reason"` — plain prose explanation. No markdown.
> `"title"` / `"brief"` — plain prose. No markdown.

No tests needed for this phase — the changes are prompt text only and existing tests mock the runner response, so they are unaffected.

---

## Progress

### Completed

- Research and planning
- Phase 1: prompt module + task handler + tests
- Phase 2: wiring & integration
- Phase 3: eval recipe
- Phase 4: strengthen existing prompts with plaintext instructions

### In Progress

(none)

### To Do

(none)

## Technical Notes

- **One `send()` call per question**: the handler loops over `phaseQuestions` and calls `send()` once per question. This keeps each LLM call focused and avoids the model silently dropping questions in a long list.
- **Running state snapshot**: the loop carries a `current` variable updated after each iteration. This means later questions see earlier answers in `answeredQuestions` context, which can help the model make better decisions.
- **Malformed JSON is per-iteration, non-fatal**: if one call returns garbage, that question is skipped and the loop continues — we don't want one bad response to discard work done for other questions.
- **`send()` third argument is `(ModelMessage | string)[]`** — plain strings are valid as message items.
- **`phaseIndex` can be `number | number[]`** — all filtering and type-narrowing must handle both shapes. Use `Array.isArray(q.phaseIndex) ? q.phaseIndex.includes(task.phase) : q.phaseIndex === task.phase`.
- **Import path convention**: task files use `.js` extensions in imports (compiled ESM); eval recipes use `.ts`.
- **No new exported types**: `PhaseQuestion` and `AnsweredQuestion` already cover all needed shapes.
- **`phasePipelineTasks` inclusion is non-optional**: if `resolve-phase-questions` is not in that set, stale tasks can bleed across phase iterations.
- **Prompt module uses `index.ts`**: this is a new convention (previous tasks use `recipe.ts` or `system.ts`). The planning note (Note 202) explicitly calls for `index.ts` — follow it.

## Files Modified/Created

### Services / Core

- `src/tasks/resolve-phase-questions.ts` — new agent-style task handler
- `src/prompts/resolve-phase-questions/index.ts` — new prompt module (systemPrompt + userMessage)
- `src/helpers.ts` — add `'resolve-phase-questions'` to `phaseTaskOrder`
- `src/run.ts` — register `handleResolvePhaseQuestions` in the handlers map
- `src/tasks/collect-feedback.ts` — remove `gather-phase-questions` from Branch 1 re-queue

### Tests

- `tests/tasks/resolve-phase-questions.test.ts` — new unit tests (8 cases)
- `tests/tasks/collect-feedback.test.ts` — update existing buggy test, add 2 new cases

### Evaluations

- `evaluations/recipes/resolve-phase-questions.ts` — new eval recipe
- `evaluations/recipes/run-all.ts` — add both new recipes
- `evaluations/recipes/collect-feedback-qa-sequencing.ts` — new eval verifying Q&A tasks are never re-queued mid-loop and survive the clean exit

### Prompts (Phase 4 — plaintext strengthening)

- `src/prompts/gather-recon/system.ts` — add plaintext output constraint
- `src/prompts/plan-phase/system.ts` — add plaintext output constraint
- `src/prompts/normalize-phase-plan/recipe.ts` — add plaintext output constraint
- `src/prompts/normalize-phase-prompt/recipe.ts` — add plaintext output constraint
- `src/prompts/revise-phase/recipe.ts` — add plaintext output constraint
- `src/prompts/synthesize-phases/recipe.ts` — add plaintext output constraint
- `src/prompts/index-phase/recipe.ts` — add plaintext output constraint
- `src/prompts/check-phase/duplication-check.ts` — annotate `reason` field as plaintext
- `src/prompts/check-phase/scope-check.ts` — annotate `reason` field as plaintext
- `src/prompts/check-phase/vagueness-check.ts` — annotate `reason` field as plaintext
- `src/prompts/gather-phase-questions/recipe.ts` — annotate `question` and `context` fields as plaintext
- `src/prompts/gather-questions/recipe.ts` — annotate `question` and `context` fields as plaintext
- `src/prompts/split-phase/recipe.ts` — annotate `title` and `brief` fields as plaintext

## Questions/Decisions Needed

- [ ] Does `gather-recon.ts` have a utility for stripping markdown fences, or should we inline a regex in the new handler?

## Decisions Made

- **Agent-style task (not `runRecipe`)**: needs file tools to search the codebase; `runRecipe` is for non-agentic JSON-output tasks only.
- **One `send()` call per question**: iterating one question at a time keeps each LLM call focused, avoids the model silently dropping items from a long list, and lets earlier answers feed into later calls as context.
- **Binary confidence**: answer goes in `answers` only if unambiguous from codebase evidence; otherwise `enriched` (with context) or silently ignored.
- **Upfront questions never touched**: `awaitingQuestions` is the user's domain; `resolve-phase-questions` only operates on `pendingQuestions`.
- **Branch 2 in `collect-feedback` unchanged**: that loop is the plain check→collect iteration and has no raised controls to resolve.
- **Q&A runs once, after all iterations, before the next phase**: `gather-phase-questions` and `resolve-phase-questions` are at the end of `phaseTaskOrder`, after `collect-feedback`. The existing check/revise loop is untouched. The only change to `collect-feedback.ts` is removing `gather-phase-questions` from Branch 1 where it was incorrectly wired.
- **Plaintext-only output for free-text fields**: any prompt that requests free-form text (including text fields embedded in JSON responses) must explicitly instruct the model to respond in plaintext — no markdown, no headings, no bullet points, no formatting characters. This is measurably faster on small models and prevents stray markdown from leaking into stored state.
- **Prompt bodies must not contain markdown syntax**: no `##` headings, no `**bold**`, no `*italic*`, no backtick fences. Bullet lists with `-` are plain text and are fine. Small models mirror the style of their instructions, so markdown decorators in the prompt produce markdown decorators in the output.

## Session History

### Session 1

- Designed `resolve-phase-questions` task from scratch (Note 202)
- Ran planning workflow: researched existing task/prompt patterns, wiring points, and test/eval structure
- Wrote full phased implementation plan to feature doc
