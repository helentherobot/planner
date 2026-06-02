import type { Recipe } from '@helentherobot/runner'
import type { ControlRecipeContext } from '@/types.js'

export const checkPhaseDuplication: Recipe<[ControlRecipeContext]> = {
  profile: '',
  prompt: ({ phaseState, controlState }) => {
    const cleared =
      controlState.dismissed.length > 0
        ? `CLEARED ITEMS — do not flag these:\n${controlState.dismissed.map((d) => `${d.path} — ${d.reason}`).join('\n')}\n\n`
        : ''

    return `${cleared}Review this phase plan for work that is cross-cutting or foundational and clearly does not belong in this specific phase. Only flag concrete tasks (not context-setting prose). Do not flag work specific to this feature even if it touches shared files.

Plan:
${phaseState.brief}

Return a JSON object: { "findings": [] } if clean, or { "findings": [{ "path": "<item name only, no explanation>", "reason": "<why it belongs in a different phase>" }] }. Do not include cleared items. Output only the JSON.`
  },
}
