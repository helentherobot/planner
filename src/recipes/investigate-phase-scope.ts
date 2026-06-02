import type { Recipe } from '@helentherobot/runner'
import type { ControlRecipeContext } from '@/types.js'

export const investigatePhaseScope: Recipe<[ControlRecipeContext]> = {
  profile: '',
  prompt: ({ phaseState, controlState }) => {
    const issues = controlState.raised.map((f) => `${f.path} — ${f.reason}`).join('\n')
    const history =
      controlState.dismissed.length > 0
        ? `\nPreviously cleared (do not re-confirm unless the plan has materially changed):\n${controlState.dismissed.map((d) => `${d.path} — ${d.reason}`).join('\n')}`
        : ''

    return `The following scope issues were flagged in this phase plan:

${issues}${history}

Plan:
${phaseState.brief}

For each issue, decide: is the file genuinely out of scope, or does it legitimately belong in this phase?

Return a JSON object with two arrays:
- "confirmed": array of path strings for files that are genuinely out of scope
- "dismissed": array of objects { "path": "<file path>", "reason": "<why it legitimately belongs here>" } for false positives

Output only the JSON, nothing else.`
  },
}
