import type { Recipe } from '@helentherobot/runner'
import type { ControlRecipeContext } from '../checks.js'

export const investigatePhaseVagueness: Recipe<[ControlRecipeContext]> = {
  profile: 'haiku',
  prompt: ({ phaseState, controlState }) => {
    const issues = controlState.raised.join('\n')

    return `The following vagueness issues were flagged in this phase plan:

${issues}

Plan:
${phaseState.brief}

For each issue, decide: is it a genuine problem that needs fixing, or a false positive?

Return a JSON object with two arrays:
- "confirmed": issues that are real problems
- "dismissed": issues that are false positives (with a brief reason appended after " — ")

Output only the JSON, nothing else.`
  },
}
