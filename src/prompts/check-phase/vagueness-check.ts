import type { ControlRecipeContext } from '@/types.js'

export function prompt({ phaseState, controlState }: ControlRecipeContext): string {
  const dismissed = controlState.dismissed.map((d) => `${d.path} — ${d.reason}`).join('\n')
  const cleared =
    controlState.dismissed.length > 0 ? `CLEARED ITEMS — do not flag these:\n${dismissed}` : ''

  return `
    ${cleared}

    Review this phase plan for steps that are too vague for a developer to act on without guessing. A step is vague only if it lacks specific file names, values, commands, or expected behaviours. Steps that name specific files, env vars, tools, or libraries are NOT vague.

    Plan:
    ${phaseState.brief}

    Return a JSON object: { "findings": [] } if clean, or { "findings": [{ "path": "<the step text, no explanation>", "reason": "<why it is vague>" }] } for each genuinely vague step. Do not include cleared items. Output only the JSON.
  `
}
