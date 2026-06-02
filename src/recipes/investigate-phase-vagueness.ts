import type { Recipe } from '@helentherobot/runner'
import type { ControlRecipeContext } from '@/types.js'

export const investigatePhaseVagueness: Recipe<[ControlRecipeContext]> = {
  profile: '',
  prompt: ({ phaseState, controlState }) => {
    const issues = controlState.raised.map((f) => `${f.path} — ${f.reason}`).join('\n')
    const history =
      controlState.dismissed.length > 0
        ? `\nPreviously cleared (do not re-confirm unless the plan has materially changed):\n${controlState.dismissed.map((d) => `${d.path} — ${d.reason}`).join('\n')}`
        : ''

    return `The following vagueness issues were flagged in this phase plan:

${issues}${history}

Plan:
${phaseState.brief}

For each issue, decide: is it a genuine problem that needs fixing, or a false positive?

Return a JSON object with two arrays:
- "confirmed": array of path strings for issues that are real problems
- "dismissed": array of objects { "path": "<the step text>", "reason": "<why it is a false positive>" } for dismissed issues

Output only the JSON, nothing else.`
  },
}
