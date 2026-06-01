import type { Recipe } from '@helentherobot/runner'
import type { ControlRecipeContext } from '../checks.js'

export const investigatePhaseScope: Recipe<[ControlRecipeContext]> = {
  profile: 'haiku',
  prompt: ({ phaseState, controlState }) => {
    const issues = controlState.raised.join('\n')

    return `The following scope issues were flagged in this phase plan:

${issues}

Plan:
${phaseState.brief}

For each issue, decide: is the file genuinely out of scope, or does it legitimately belong in this phase?

Return a JSON object with two arrays:
- "confirmed": files that are genuinely out of scope
- "dismissed": files that legitimately belong here (with a brief reason appended after " — ")

Output only the JSON, nothing else.`
  },
}
