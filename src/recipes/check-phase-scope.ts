import type { Recipe } from '@helentherobot/runner'
import type { ControlRecipeContext } from '@/types.js'

export const checkPhaseScope: Recipe<[ControlRecipeContext]> = {
  profile: '',
  prompt: ({ phaseState, controlState }) => {
    const cleared =
      controlState.dismissed.length > 0
        ? `CLEARED ITEMS — do not flag these:\n${controlState.dismissed.map((d) => `${d.path} — ${d.reason}`).join('\n')}\n\n`
        : ''

    const authorisedFiles = phaseState.index
      ? `\nAuthorised files for this phase:\n${phaseState.index}`
      : ''

    return `${cleared}Review this phase plan for files that appear to be out of scope. Do not flag cleared items.

Plan:
${phaseState.brief}${authorisedFiles}

Return a JSON object: { "findings": [] } if clean, or { "findings": [{ "path": "<file path only, no explanation>", "reason": "<why it is out of scope>" }] }. Output only the JSON.`
  },
}
