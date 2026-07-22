# Helen Planner — KB Benchmark Fixes

- Branch: `feature/2026-07-22-benchmark-fixes`

## Overview

Helen Planner is a multi-step AI planning library. A 7-model benchmark
against the Friday Knowledge Base revealed several systematic failure
modes: `resolvePhaseQuestions` produces non-JSON output on some models
(causing 0–78% skip rates), `gatherRecon` and `synthesizePhases` have no
quality loops so bad output propagates silently, task handlers do not
validate or retry model responses, and cross-phase contradictions (e.g.
column name drift between phases) are never detected.

This branch implements the full set of fixes identified in the benchmark
analysis (note 278): JSON mode for question resolution, per-task output
validation with automatic retry, recon and synthesis quality loops,
cross-phase coherence checking, schema-first planning, and the associated
type/config cleanup.

### Background / Current Behavior

- **Current behavior**: Handlers accept whatever the model returns and
  propagate it downstream. `resolvePhaseQuestions` silently skips
  questions when JSON parsing fails. `synthesizePhases` calls
  `expandPhases` immediately with no quality check. `cleanup` runs with
  no cross-phase coherence verification.
- **Problem**: Bad model output causes silent failures, skipped questions,
  schema drift between phases, and plans that contradict themselves across
  phases.
- **Where it happens**: `src/tasks/` handlers, `src/helpers.ts`
  (`expandPhases`), `src/run.ts` (`drainTasks`).
- **Impact**: Plan quality degrades silently on weaker models; no retry or
  recovery path exists for malformed or thin responses.

### Target Outcome

This feature will add output validation, quality loops, and coherence
checks so that the planner self-corrects on bad model output instead of
silently propagating it.

## Implementation Plan

> Code style: no useless comments. Run `npm run format` and `npm test`
> before every commit. No auto-committing. Complete one phase at a time.

---

### Phase 0 — Migrate feature docs to date-based prefixes

**Scope:** Rename the four existing `NNN-slug.md` feature docs (and their
corresponding local branches and worktrees) from numeric prefixes to
`YYYY-MM-DD-slug` date prefixes. Also removes `features/template.md` if
it exists. This is a one-time housekeeping step with no source code
changes.

Run the `/custom-workflow-migrate-to-date-prefix` skill in dry-run mode
first to preview the changes, then apply with `dry-run:false`.

#### 0.1 — Dry run (preview)

```
/custom-workflow-migrate-to-date-prefix dry-run:true
```

Four docs to migrate (dates resolved from git history):

- `001-initial-setup.md`
- `002-quality-of-life.md`
- `003-interrogation.md`
- `004-finding-answers.md`

Review the printed plan. If any doc shows an unexpected date (fell through
to the user-prompt path), supply the correct `YYYY-MM-DD`.

#### 0.2 — Apply

```
/custom-workflow-migrate-to-date-prefix dry-run:false
```

The skill will:

- `git mv` each doc to its date-prefixed name.
- Rename each local branch (`feature/NNN-slug` → `feature/YYYY-MM-DD-
slug`).
- Remove and recreate each worktree under the new branch name (skipping
  any with uncommitted changes).
- Update any README/index file in `features/` that references the old
  filenames.
- Remove `features/template.md` if present.

#### 0.3 — Commit

Stage and commit the renamed docs:

```bash
git add features/
git commit -m "Migrate feature docs to date-based prefixes"
```

Remote branches are NOT updated by the skill. To clean up the remote for
each renamed branch:

```bash
git push origin :feature/NNN-slug feature/YYYY-MM-DD-slug
```

(Run once per renamed branch after verifying the rename looks correct.)

---

### Phase 1 — Types, config cleanup, and new state fields

**Scope:** All new interfaces, renamed config fields, new PlanState
fields, updated RunResult union, and the `resolveOptions` helper. No
handler logic changes yet — this phase is purely type and shape work.
Tests cover renamed fields and the new helper.

#### 1.1 — Rename Config fields (`src/types.ts`)

In the `Config` interface:

- Rename `minimumIterations` → `minIterations`
- Rename `maximumIterations` → `maxIterations`

Update every call site:

- `src/tasks/collect-feedback.ts`: two references
  (`adapters.config.minimumIterations`, `adapters.config.maximumIterations`)
- `tests/tasks/collect-feedback.test.ts`: config fixture
- `tests/tasks/resolve-phase-questions.test.ts`: config fixture

#### 1.2 — Add new type definitions (`src/types.ts`)

Add `TaskValidationEntry` discriminated union immediately after the
`Config` interface:

```ts
export type TaskValidationEntry =
  | { type: 'minLength'; value: number; maxRetries: number }
  | { type: 'minItems'; value: number; maxRetries: number }
  | { type: 'schema'; required: string[]; maxRetries: number }
```

Add `TaskOptions` interface:

```ts
export interface TaskOptions {
  jsonMode?: boolean
}
```

Add `CrossPhaseFinding` interface:

```ts
export interface CrossPhaseFinding {
  phases: number[]
  description: string
}
```

Add `SchemaArtifact` interfaces (used by extract-schema output before
serialisation):

```ts
export interface SchemaArtifactTable {
  name: string
  columns: { name: string; type: string; primaryKey?: boolean }[]
  primaryKeyStyle: 'integer' | 'uuid' | 'string' | 'unknown'
}

export interface SchemaArtifact {
  tables: SchemaArtifactTable[]
}
```

#### 1.3 — Extend Config interface (`src/types.ts`)

Add four optional fields to `Config`:

```ts
taskValidation?: Record<string, TaskValidationEntry>
taskOptions?: Record<string, TaskOptions>
schemaFirst?: boolean
maxCrossPhaseIndexLength?: number
```

`taskProfiles` already accepts an open record. Two new documented
supported keys (no type change required): `extractSchema` and
`crossPhaseCheck`.

#### 1.4 — Extend PlanState (`src/types.ts`)

Add the following optional fields to `PlanState` with their defaults
documented inline:

```ts
// Fix 2 — recon quality loop
reconRetries?: number               // default 0
reconStatus?: 'ok' | 'incomplete'   // default 'ok'
reconAmendment?: string | null      // default null

// Fix 2 — synthesis quality loop
synthesisRetries?: number               // default 0
synthesisStatus?: 'ok' | 'incomplete'   // default 'ok'
synthesisAmendment?: string | null      // default null

// Fix 5 — cross-phase check
crossPhaseFindings?: CrossPhaseFinding[]  // default []
crossPhaseCheckComplete?: boolean         // default false

// Fix 6 — schema-first planning
schemaArtifact?: string | null  // default null
```

All fields are optional so existing persisted state remains valid on load.

#### 1.5 — Add failed status to RunResult (`src/types.ts`)

Extend the `RunResult` union:

```ts
export type RunResult =
  | { status: 'complete'; state: PlanState }
  | { status: 'needs-answers'; questions: Question[]; state: PlanState }
  | { status: 'failed'; reason: string; state: PlanState }
```

#### 1.6 — Update drainTasks for failed status (`src/run.ts`)

Wrap the `handler()` dispatch call in a try/catch. On any thrown error,
return `{ status: 'failed', reason: error.message, state: current }`
instead of propagating. This is the catch-all; specific validation-failed
reasons are thrown explicitly from handlers in Phase 3.

Update `revise.ts` to handle `result.status === 'failed'` — rethrow as an
`Error` with `result.reason` as the message.

#### 1.7 — Add resolveOptions helper (`src/helpers.ts`)

Add `resolveOptions` parallel to `resolveProfile` and `resolveTools`:

```ts
export function resolveOptions(
  adapters: Adapters,
  taskType: string,
): TaskOptions {
  return adapters.config.taskOptions?.[taskType] ?? {}
}
```

Keys are kebab-case task type strings, matching the existing pattern for
`taskProfiles` and `taskTools`. No camelCase conversion needed — the
existing helpers also use raw kebab-case strings as record keys.

#### 1.8 — Tests

- `tests/tasks/collect-feedback.test.ts`: update config fixture field
  names; verify the rename does not break any assertion.
- `tests/tasks/resolve-phase-questions.test.ts`: update config fixture.
- `tests/helpers.test.ts` (new or add to existing): test for
  `resolveOptions` — returns the entry when present, returns `{}` when
  absent, returns `{}` when `taskOptions` is undefined on config.
- `tests/run.test.ts`: add a test where a handler throws — verify
  `drainTasks` returns `{ status: 'failed', reason: '...' }`.

---

### Phase 2 — Fix 4: plan-phase prompt length instruction

**Scope:** Single prompt file edit. Lowest effort, early win.

#### 2.1 — Append to system prompt (`src/prompts/plan-phase/system.ts`)

Append the following as a new paragraph (blank line before it) to the end
of the existing system prompt, after the "Do not use markdown" instruction.
Wrap at 80 characters:

```
Your plan must be thorough. Aim for at least 3,000 characters covering
every file change, with exact paths, content specifications, and
rationale. Short or incomplete plans are not acceptable.
```

#### 2.2 — Tests

No new test needed for a prompt string change. Confirm
`npm run format && npm test` pass.

---

### Phase 3 — Fix 3: per-task output validation with automatic retry

**Scope:** Shared validation helper + retry logic wired into each handler.
Retry is implemented by calling `send()` again with the prior messages
plus a retry user message appended. Pattern B handlers (`runRecipe`) that
need retry must call `send()` directly instead.

#### 3.1 — Add validateOutput helper (`src/helpers.ts`)

```ts
export function validateOutput(
  entry: TaskValidationEntry | undefined,
  output: string,
): { valid: boolean; retryPrompt: string } {
  if (!entry) return { valid: true, retryPrompt: '' }

  if (entry.type === 'minLength') {
    const valid = output.length >= entry.value
    return {
      valid,
      retryPrompt: valid
        ? ''
        : `The previous response was too short (below the required minimum ` +
          `of ${entry.value} characters). Produce a thorough, complete ` +
          `response of at least ${entry.value} characters.`,
    }
  }

  if (entry.type === 'minItems') {
    const lines = output.split('\n').filter((l) => l.trim().length > 0)
    const valid = lines.length >= entry.value
    return {
      valid,
      retryPrompt: valid
        ? ''
        : `The previous response did not produce enough phase titles. ` +
          `Produce a complete ordered list of implementation phases.`,
    }
  }

  if (entry.type === 'schema') {
    try {
      const parsed = JSON.parse(output)
      const missing = entry.required.filter((k) => !(k in parsed))
      const valid = missing.length === 0
      return {
        valid,
        retryPrompt: valid
          ? ''
          : `The previous response did not match the required format. ` +
            `Return valid JSON containing the required fields: ` +
            `${entry.required.join(', ')}.`,
      }
    } catch {
      return {
        valid: false,
        retryPrompt:
          `The previous response was not valid JSON. Return a JSON ` +
          `object containing the required fields: ` +
          `${entry.required.join(', ')}.`,
      }
    }
  }

  return { valid: true, retryPrompt: '' }
}
```

#### 3.2 — Add extractText helper (`src/helpers.ts`)

All three Pattern A handlers duplicate the same text-extraction logic from
`SendResult`. Extract it into a shared helper:

```ts
export function extractText(messages: ModelMessage[]): string {
  const last = messages.at(-1)
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  return last.content
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text)
    .join('')
}
```

Import `ModelMessage` and `TextPart` from `@helentherobot/runner`. Check
the installed type declaration paths before importing.

Update `gather-recon`, `plan-phase`, and `resolve-phase-questions` to use
`extractText` in place of their current inline extraction code.

#### 3.3 — Add defaultTaskValidation and mergeTaskValidation

(`src/helpers.ts` or a new `src/defaults.ts`)

```ts
export const defaultTaskValidation: Record<string, TaskValidationEntry> = {
  'gather-recon': { type: 'minLength', value: 500, maxRetries: 2 },
  'plan-phase': { type: 'minLength', value: 800, maxRetries: 2 },
  'normalize-phase-plan': { type: 'minLength', value: 200, maxRetries: 2 },
  'normalize-phase-prompt': { type: 'minLength', value: 300, maxRetries: 2 },
  'synthesize-phases': { type: 'minItems', value: 1, maxRetries: 2 },
  'resolve-phase-questions': {
    type: 'schema',
    required: ['resolutions'],
    maxRetries: 2,
  },
  'index-phase': { type: 'schema', required: ['files'], maxRetries: 2 },
}

export function mergeTaskValidation(
  overrides?: Record<string, TaskValidationEntry>,
): Record<string, TaskValidationEntry> {
  return { ...defaultTaskValidation, ...overrides }
}
```

Call `mergeTaskValidation(adapters.config.taskValidation)` inside
`drainTasks` (or pass the merged map into `Adapters` via a new field)
and thread it into handler calls. The simplest approach: compute the
merged map once at the start of `drainTasks` and pass it into
each handler via an updated `Adapters` shape, or expose it on
`adapters.config` after merging at run start.

Add check-task and cross-phase entries in Phases 5 and 6 when those
handlers are created.

#### 3.4 — Wire validation into Pattern A handlers

For `gather-recon`, `plan-phase`:

After the initial `send()` call, resolve the validation entry:
`const entry = mergedValidation['gather-recon']` (substitute the actual
task type). Call `validateOutput(entry, text)`. If invalid and retries
remain, append a new user message with `retryPrompt` to `messages` and
call `send()` again with the full updated messages array. Increment a
local `retries` counter (starts at 0). Repeat until valid or retries
exhausted. If still invalid after exhausting retries, throw
`new Error('gather-recon-validation-failed')` (drainTasks catch-all
converts this to `{ status: 'failed', reason: '...' }`).

Retry loop pattern:

```ts
let retries = 0
let result = await send(runner, sessionOptions, messages)
let text = extractText(result.messages)
let check = validateOutput(entry, text)

while (!check.valid && retries < (entry?.maxRetries ?? 0)) {
  retries++
  messages = [...result.messages, check.retryPrompt]
  result = await send(runner, sessionOptions, messages)
  text = extractText(result.messages)
  check = validateOutput(entry, text)
}

if (!check.valid) throw new Error('gather-recon-validation-failed')
```

#### 3.5 — Wire validation into Pattern B handlers

`normalize-phase-plan`, `normalize-phase-prompt`, `synthesize-phases`,
`index-phase` currently use `runRecipe`. For retry support, restructure
these to use `send()` directly, passing the prompt as
`[{ role: 'user', content: promptText }]` with no system prompt (or with
the recipe system prompt if one exists — check `runRecipe` source for
whether it injects a system prompt). Apply the same retry loop as 3.4.

Check the installed runner's `runRecipe` signature before deciding; if it
accepts a `messages` array, use that instead of dropping to `send()`.

For `synthesize-phases`: the `minItems` validation counts non-empty lines
in the output (the current phase list format — one title per line). The
`value: 1` threshold means at least one phase must be present.

For `index-phase`: the spec lists `{ type: 'schema', required: ['files'] }`
but check whether the current `index-phase` prompt actually requests JSON
output with a `files` field or free-form text (one file path per line).
If free-form, align the validation strategy to `minLength` instead of
`schema`, or update the `index-phase` prompt to request JSON.

#### 3.6 — Wire validation into resolve-phase-questions

Replace the `console.warn` + `continue` on JSON parse failure with the
schema validation retry loop. The per-question loop in `resolve-phase-
questions` already calls `send()` independently per question — apply the
retry inside that loop.

#### 3.7 — Tests

For each handler that gets validation wiring, add tests covering:

- Normal path: valid output → no retry, returns updated state.
- Retry path: first call returns invalid output, second returns valid →
  handler retries once, returns updated state.
- Exhausted retries: all calls return invalid output → handler throws with
  the expected error message.

`tests/helpers.test.ts`: add tests for `validateOutput` covering all
three strategy types, valid and invalid cases.

---

### Phase 4 — Fix 1: JSON mode for resolvePhaseQuestions

**Scope:** Wire `resolveOptions` into `resolve-phase-questions`; handle
`jsonMode: true` via prompt instruction since the runner's `SessionOptions`
does not expose a `jsonMode` field.

#### 4.1 — Read taskOptions in handler

(`src/tasks/resolve-phase-questions.ts`)

At the top of the handler:

```ts
const opts = resolveOptions(adapters, 'resolve-phase-questions')
```

#### 4.2 — Apply jsonMode via prompt instruction

When `opts.jsonMode === true`, append to the system prompt before calling
`send()`:

```
Respond with only valid JSON. Do not include prose, markdown fences, or
explanations outside the JSON object.
```

This is additive — does not replace the existing prompt content.

Note: the installed runner's `SessionOptions` has no `jsonMode` or
`responseFormat` field. Prompt injection is the correct approach for now.
If a future runner version adds native JSON mode, wire it through
`SessionOptions` at that point — the prompt instruction is safe as a
universal fallback.

#### 4.3 — Simplify JSON extraction when jsonMode active

When `opts.jsonMode === true`, attempt `JSON.parse` on the full response
text first. If it succeeds, use the result directly without regex
extraction. If it fails, fall through to regex extraction as before. The
Phase 3 schema validation retry handles persistent parse failures.

#### 4.4 — Tests

- `taskOptions['resolve-phase-questions'] = { jsonMode: true }` → verify
  the system prompt contains the JSON instruction.
- `jsonMode` absent → system prompt unchanged, no regression.

---

### Phase 5 — Fix 2: recon and synthesis quality loops

**Scope:** Add `check-recon` and `check-synthesis` task types. Refactor
`synthesize-phases` to defer `expandPhases` to the `check-synthesis`
handler. Add amendment feedback into `gather-recon` and
`synthesize-phases` prompts.

Both check tasks are agentic (tool-using) calls using the same codebase
tool set as `gather-recon`.

#### 5.1 — Refactor synthesize-phases to defer expandPhases

(`src/tasks/synthesize-phases.ts`)

Change the handler to:

1. Parse model output and build `state.phases` as before.
2. Do NOT call `expandPhases`.
3. Prepend `{ type: 'check-synthesis' }` to `state.remainingTasks`.
4. Return the updated state.

Per-phase task injection now happens inside the `check-synthesis` handler
when the check passes.

#### 5.2 — Update gather-recon to inject check-recon

(`src/tasks/gather-recon.ts`)

At the end of the handler, after storing `state.recon`, prepend
`{ type: 'check-recon' }` to `state.remainingTasks`. This applies on
every invocation — both initial and retry runs. The retry path only
re-queues `gather-recon` (not the pair), so `check-recon` is injected
naturally when `gather-recon` completes its retry run.

Also: if `state.reconAmendment` is non-null, append to the user message:
`\n\nPrevious recon was rejected: ${state.reconAmendment}. Address this
and produce a corrected recon.`

#### 5.3 — Create check-recon handler (`src/tasks/check-recon.ts`)

Logic:

1. Resolve profile: `resolveProfile(adapters, 'check-recon')`.
2. Resolve validation entry (`{ type: 'schema', required: ['pass', 'gap'],
maxRetries: 2 }`).
3. Build user message: inject `state.recon` as context — `Here is the
existing recon:\n\n${state.recon}`. Do not include `reconAmendment`
   in the check prompt — that is for `gather-recon` only.
4. System prompt instructs the agent to:
   - Verify every file path in `state.recon` actually exists.
   - Confirm library/technology claims match installed/configured packages.
   - Identify relevant areas of the codebase absent from `state.recon`.
   - Respond with only a JSON object: `{ "pass": boolean, "gap":
string | null }`.
5. Make an agentic `send()` call with the codebase tools (same tools as
   `gather-recon`, resolved via `resolveTools(adapters, 'check-recon')`
   with fallback to the default tool set).
6. Validate and retry on schema failure (up to `entry.maxRetries`).
7. Parse `{ pass, gap }`.
8. If `pass === true`:
   - Set `state.reconAmendment = null`.
   - Set `state.reconRetries = 0`.
   - Return state.
9. If `pass === false`:
   - Increment `state.reconRetries` (default 0 if not set).
   - If `state.reconRetries <= (validationEntry.maxRetries ?? 2)`:
     set `state.reconAmendment = gap`, prepend `{ type: 'gather-recon' }`
     to `state.remainingTasks`, return state.
   - If exhausted: set `state.reconStatus = 'incomplete'`, throw
     `new Error('recon-incomplete')`.

#### 5.4 — Update synthesize-phases to read synthesisAmendment

(`src/tasks/synthesize-phases.ts`)

If `state.synthesisAmendment` is non-null, append to the prompt before
sending: `\n\nPrevious synthesis was rejected: ${state.synthesisAmendment}.
Address this and produce a corrected phase list.`

`synthesize-phases` always injects `check-synthesis` after itself (5.1).
The retry path only re-queues `synthesize-phases` — `check-synthesis` is
injected again when that run completes.

#### 5.5 — Create check-synthesis handler

(`src/tasks/check-synthesis.ts`)

Logic mirrors check-recon:

1. Resolve profile: `resolveProfile(adapters, 'check-synthesis')`.
2. Resolve validation entry (`{ type: 'schema', required: ['pass', 'gap'],
maxRetries: 2 }`).
3. Build user message with: brief (`state.brief`), `state.recon`, and
   phase titles (`state.phases.map(p => p.title).join('\n')`).
4. System prompt instructs the agent to:
   - Verify all proposed phases collectively cover the brief and recon.
   - Check that no phase title refers to a non-existent component or path.
   - Confirm phase ordering is logically coherent.
   - Respond with only a JSON object: `{ "pass": boolean, "gap":
string | null }`.
5. Agentic `send()` call with codebase tools. Validate and retry on schema
   failure.
6. Parse `{ pass, gap }`.
7. If `pass === true`:
   - Set `state.synthesisAmendment = null`.
   - Set `state.synthesisRetries = 0`.
   - Call `expandPhases(state)` and return the result (this is the deferred
     call from 5.1).
8. If `pass === false`:
   - Increment `state.synthesisRetries`.
   - If within retry cap: set `state.synthesisAmendment = gap`, prepend
     `{ type: 'synthesize-phases' }` to `state.remainingTasks`, return.
   - If exhausted: set `state.synthesisStatus = 'incomplete'`, throw
     `new Error('synthesis-incomplete')`.

#### 5.6 — Register new handlers in run.ts (`src/run.ts`)

Add to `handlers`:

```ts
'check-recon':     checkRecon,
'check-synthesis': checkSynthesis,
```

Import from `./tasks/check-recon.js` and `./tasks/check-synthesis.js`.

#### 5.7 — Update taskValidation defaults

Add to `defaultTaskValidation`:

```ts
'check-recon':     { type: 'schema', required: ['pass', 'gap'], maxRetries: 2 },
'check-synthesis': { type: 'schema', required: ['pass', 'gap'], maxRetries: 2 },
```

#### 5.8 — Tests

- `tests/tasks/check-recon.test.ts`:
  - Pass path: `{ pass: true }` → state unchanged, amendment cleared,
    retries reset.
  - Fail path: `{ pass: false, gap: 'missing X' }` → `reconAmendment` set,
    `gather-recon` prepended.
  - Exhausted retries: throws `'recon-incomplete'`.
- `tests/tasks/gather-recon.test.ts`: verify `check-recon` is always
  prepended to `remainingTasks`; verify amendment is appended to prompt
  when set.
- `tests/tasks/check-synthesis.test.ts`: same three paths; verify
  `expandPhases` called on pass.
- `tests/tasks/synthesize-phases.test.ts`: verify `expandPhases` is no
  longer called; verify `check-synthesis` is prepended; verify amendment
  appended when set.

---

### Phase 6 — Fix 5: cross-phase coherence check

**Scope:** Add `cross-phase-check` task type, inject it from `cleanup`
via the `crossPhaseCheckComplete` flag, feed contradictions back to
`revise-phase`.

#### 6.1 — Update cleanup handler (`src/tasks/cleanup.ts`)

Change to:

1. If `!(state.crossPhaseCheckComplete ?? false)`:
   - Set `state.crossPhaseCheckComplete = true`.
   - Prepend `{ type: 'cleanup' }` then prepend `{ type: 'cross-phase-
check' }` to `state.remainingTasks` (cross-phase-check runs first,
     cleanup second).
   - Return state (do not set `completedAt` yet).
2. If `state.crossPhaseCheckComplete === true`:
   - Set `state.completedAt = Date.now()`.
   - Return state.

#### 6.2 — Create cross-phase-check handler

(`src/tasks/cross-phase-check.ts`)

1. Filter `state.phases` to those with a non-empty `index` field. If none,
   set `state.crossPhaseFindings = []` and return.
2. Compute total index length. If `config.maxCrossPhaseIndexLength` is set
   and the total exceeds it, set `state.crossPhaseFindings = []` and
   return.
3. Build the prompt: list each phase's index under a plain-text header
   (`Phase 0:\n${phase.index}`). Instruct the model to identify cross-phase
   contradictions (column name conflicts, mismatched ID types, file
   ownership conflicts, inconsistent route definitions). Instruct the model
   to respond with only a JSON object: `{ "findings": CrossPhaseFinding[] }`.
4. Use `resolveProfile(adapters, 'cross-phase-check')` for model selection.
5. Tool-free model call via `send()`. Validate with
   `{ type: 'schema', required: ['findings'], maxRetries: 2 }`.
6. Parse `{ findings }`. If `!Array.isArray(findings)`, treat as `[]`.
7. Store `state.crossPhaseFindings = findings`.
8. If `findings.length === 0`: return state.
9. If `task.secondPass === true`: replace `state.crossPhaseFindings` with
   new findings, do not queue revise tasks or another pass, return.
10. For each finding, for each phase index in `finding.phases`, prepend a
    `revise-phase` task:
    ```ts
    {
      type: 'revise-phase',
      phase: phaseIndex,
      crossPhaseFinding: finding,
    }
    ```
11. Append `{ type: 'cross-phase-check', secondPass: true }` after the
    revise tasks in `state.remainingTasks`.

#### 6.3 — Update revise-phase handler (`src/tasks/revise-phase.ts`)

If `task.crossPhaseFinding` is non-null, append to the revision prompt as
a final paragraph:
`Additionally, resolve this cross-phase contradiction: ${task.
crossPhaseFinding.description}`

This is additive — normal per-phase revision content still applies.

#### 6.4 — Register handler in run.ts

Add `'cross-phase-check': crossPhaseCheck` to `handlers`. Import from
`./tasks/cross-phase-check.js`.

#### 6.5 — Update taskValidation defaults

Add:

```ts
'cross-phase-check': { type: 'schema', required: ['findings'], maxRetries: 2 },
```

#### 6.6 — Tests

- `tests/tasks/cleanup.test.ts`:
  - First call (`crossPhaseCheckComplete` falsy): injects `cross-phase-
check` and `cleanup` into queue, does NOT set `completedAt`.
  - Second call (`crossPhaseCheckComplete` true): sets `completedAt`.
- `tests/tasks/cross-phase-check.test.ts`:
  - No phases with index → `crossPhaseFindings = []`, no revise tasks.
  - No contradictions → `crossPhaseFindings = []`, no revise tasks.
  - Contradictions found → queues `revise-phase` per affected phase,
    appends second-pass task.
  - Second pass with findings → replaces findings, no further revise
    tasks or third pass queued.
- `tests/tasks/revise-phase.test.ts`: verify `crossPhaseFinding` on task
  appends to revision prompt.

---

### Phase 7 — Fix 6: schema-first planning

**Scope:** When `config.schemaFirst === true`, inject `extract-schema`
after Phase 0's `normalize-phase-plan`, populate `state.schemaArtifact`,
and inject it into subsequent `plan-phase` prompts.

#### 7.1 — Update normalize-phase-plan to inject extract-schema

(`src/tasks/normalize-phase-plan.ts`)

After storing `phase.brief`, check both `config.schemaFirst === true` and
`task.phase === 0`. If both true, prepend `{ type: 'extract-schema',
phase: 0 }` to `state.remainingTasks` before returning.

#### 7.2 — Create extract-schema handler

(`src/tasks/extract-schema.ts`)

1. Resolve profile: `resolveProfile(adapters, 'extract-schema')`.
2. Build user message: pass `state.phases[0].brief` as context. Instruct
   the model to extract all table/column definitions as a JSON object
   matching `SchemaArtifact`. Instruct the model to respond with only the
   JSON object — no prose, no markdown fences.
3. Call `send()` (tool-free, single-shot).
4. Validate with `{ type: 'schema', required: ['tables'], maxRetries: 2 }`.
5. Parse the JSON. If `parsed.tables.length === 0`, set
   `state.schemaArtifact = null` and return.
6. Set `state.schemaArtifact = JSON.stringify(parsed)`.

#### 7.3 — Update plan-phase to inject schemaArtifact

(`src/tasks/plan-phase.ts`)

Before building the user message, check `state.schemaArtifact` and
`task.phase > 0`. If both conditions hold, append a labelled section to
the user message:

```
Locked schema from Phase 0:
${state.schemaArtifact}
```

Guard: `state.schemaArtifact && task.phase > 0`. Phase 0 generates the
schema artifact; it does not consume it.

#### 7.4 — Register handler in run.ts

Add `'extract-schema': extractSchema` to `handlers`. Import from
`./tasks/extract-schema.js`.

#### 7.5 — Update taskValidation defaults

Add:

```ts
'extract-schema': { type: 'schema', required: ['tables'], maxRetries: 2 },
```

#### 7.6 — Tests

- `tests/tasks/normalize-phase-plan.test.ts`:
  - `schemaFirst: true`, `task.phase === 0` → `extract-schema` prepended.
  - `schemaFirst: false` → no injection.
  - `schemaFirst: true`, `task.phase === 1` → no injection.
- `tests/tasks/extract-schema.test.ts`:
  - Valid schema → `state.schemaArtifact` is populated.
  - `{ tables: [] }` → `state.schemaArtifact = null`.
  - Malformed JSON → retries; exhausted → throws.
- `tests/tasks/plan-phase.test.ts`:
  - `schemaArtifact` set, `task.phase === 1` → schema injected into user
    message.
  - `schemaArtifact` null → no injection.
  - `task.phase === 0` → no injection even if `schemaArtifact` is set.

---

### Phase 8 — Version bump

**Scope:** Bump `package.json` to `0.5.0` to reflect the breaking changes
introduced in this branch (RunResult union extended, Config fields renamed,
new task type strings added). Bump before tagging so the published package
version matches the git tag.

#### 8.1 — Update package.json

In `package.json`, change:

```
"version": "0.4.1"
```

to:

```
"version": "0.5.0"
```

#### 8.2 — Commit and tag

```bash
git add package.json
git commit -m "Phase 8: Bump version to 0.5.0"
git tag v0.5.0
git push origin v0.5.0
```

---

## Breaking Changes

### RunResult gains `failed` status

```ts
type RunResult =
  | { status: 'complete'; state: PlanState }
  | { status: 'needs-answers'; questions: Question[]; state: PlanState }
  | { status: 'failed'; reason: string; state: PlanState }
```

Consumers doing exhaustive narrowing on `status` must handle the new case.

### Config field renames

- `minimumIterations` → `minIterations`
- `maximumIterations` → `maxIterations`

All callers passing these fields must update simultaneously.

### PlanState gains new optional fields

All new fields are optional with defined defaults. Existing persisted state
is safe on load. TypeScript callers constructing a literal `PlanState`
must add new fields or spread from a defaults object.

### New task type strings

`check-recon`, `check-synthesis`, `cross-phase-check`, `extract-schema`.
Any code doing exhaustive switching on task type strings must be updated.

### synthesize-phases no longer calls expandPhases

Any test or integration code that inspects `state.remainingTasks` after
`synthesize-phases` and expects per-phase tasks to be present will break.
Per-phase tasks are now queued by `check-synthesis` on pass.

---

## Files to Create

- `src/tasks/check-recon.ts`
- `src/tasks/check-synthesis.ts`
- `src/tasks/cross-phase-check.ts`
- `src/tasks/extract-schema.ts`
- `tests/tasks/check-recon.test.ts`
- `tests/tasks/check-synthesis.test.ts`
- `tests/tasks/cross-phase-check.test.ts`
- `tests/tasks/extract-schema.test.ts`

## Files to Modify

- `src/types.ts` — Config renames + new types + RunResult failed status
- `src/helpers.ts` — resolveOptions, validateOutput, extractText,
  defaultTaskValidation, mergeTaskValidation
- `src/run.ts` — drainTasks try/catch, register new handlers
- `src/revise.ts` — handle failed status
- `src/tasks/collect-feedback.ts` — field rename
- `src/tasks/gather-recon.ts` — inject check-recon, read reconAmendment
- `src/tasks/synthesize-phases.ts` — defer expandPhases, inject
  check-synthesis, read synthesisAmendment
- `src/tasks/normalize-phase-plan.ts` — inject extract-schema on phase 0
- `src/tasks/plan-phase.ts` — inject schemaArtifact into user message
- `src/tasks/revise-phase.ts` — append crossPhaseFinding to prompt
- `src/tasks/cleanup.ts` — inject cross-phase-check via
  crossPhaseCheckComplete flag
- `src/tasks/resolve-phase-questions.ts` — resolveOptions, jsonMode wiring
- `src/prompts/plan-phase/system.ts` — length instruction
- `tests/tasks/collect-feedback.test.ts` — fixture rename
- `tests/tasks/resolve-phase-questions.test.ts` — fixture rename
- `tests/tasks/gather-recon.test.ts` — verify check-recon injection
- `tests/tasks/synthesize-phases.test.ts` — verify deferred expandPhases
- `tests/tasks/normalize-phase-plan.test.ts` — verify extract-schema
  injection
- `tests/tasks/plan-phase.test.ts` — verify schemaArtifact injection
- `tests/tasks/revise-phase.test.ts` — verify crossPhaseFinding prompt
- `tests/tasks/cleanup.test.ts` — verify cross-phase-check injection
- `tests/run.test.ts` — verify failed status on handler throw

## Technical Notes

### Runner pattern split (A vs B)

- Pattern A (`send()`): `gather-recon`, `plan-phase`,
  `resolve-phase-questions`. Returns `{ messages: ModelMessage[] }`.
  Retry by appending to the messages array.
- Pattern B (`runRecipe`): most other handlers. Returns `{ text: string }`.
  Retry requires restructuring to `send()` directly, or re-calling
  `runRecipe` with an amended prompt string.
- For consistency, Pattern B handlers that need retry should be
  restructured to use `send()`. Check the `runRecipe` signature in the
  installed runner before deciding.

### No jsonMode in SessionOptions

The installed `@helentherobot/runner` does not expose `jsonMode` on
`SessionOptions`. JSON output is enforced via prompt instruction when
`taskOptions['resolve-phase-questions'].jsonMode === true`. If a future
runner version adds native JSON mode, wire it through `SessionOptions`
at that point.

### synthesize-phases / expandPhases coupling

Between `synthesize-phases` completing and `check-synthesis` passing,
`state.phases` is populated but `state.remainingTasks` does not contain
per-phase tasks. This is intentional — no code should assume per-phase
tasks are present before `check-synthesis` has run.

### Phase index stability

`cross-phase-check` runs after all phase pipelines. It reads
`state.phases` at execution time, so it always operates on the final
phase set (including any phases added by `split-phase`).

### extract-schema ordering

`extract-schema` is injected by `normalize-phase-plan` for Phase 0 via
`prepend` — it runs immediately after `normalize-phase-plan` completes,
before the rest of Phase 0's pipeline continues. `state.schemaArtifact`
is populated before any Phase 1+ `plan-phase` calls.
