import type { ControlRecipeContext } from '@/types.js'

export function prompt({ phaseState, controlState }: ControlRecipeContext): string {
  const dismissed = controlState.dismissed.map((d) => `${d.path} — ${d.reason}`).join('\n')
  const cleared =
    controlState.dismissed.length > 0 ? `CLEARED ITEMS — do not flag these:\n${dismissed}` : ''
  const authorisedFiles = phaseState.index
    ? `Authorised files for this phase:\n${phaseState.index}`
    : ''

  return `
    ${cleared}

    Review this phase plan for files that appear to be out of scope. Do not flag cleared items.

    Plan:
    ${phaseState.brief}

    ${authorisedFiles}

    Return a JSON object: { "findings": [] } if clean, or { "findings": [{ "path": "<file path only, no explanation>", "reason": "<why it is out of scope>" }] }. Output only the JSON.
  `
}
