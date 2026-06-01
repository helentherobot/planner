import type { Recipe } from '@helentherobot/runner'
import type { ControlRecipeContext } from '../checks.js'

export const checkPhaseVagueness: Recipe<[ControlRecipeContext]> = {
  profile: 'haiku',
  prompt: ({ phaseState, controlState }) => {
    const cleared =
      controlState.dismissed.length > 0
        ? `\nPreviously reviewed and cleared — do not re-flag:\n${controlState.dismissed.join('\n')}`
        : ''

    return `Review this phase plan for vague or ambiguous instructions:

${phaseState.brief}${cleared}

Return either "(clean)" or a bullet list of vague steps.`
  },
}
