import type { Recipe } from '@helentherobot/runner'
import type { ControlRecipeContext } from '../checks.js'

export const checkPhaseDuplication: Recipe<[ControlRecipeContext]> = {
  profile: 'haiku',
  prompt: ({ phaseState, controlState }) => {
    const cleared =
      controlState.dismissed.length > 0
        ? `\nPreviously reviewed and cleared — do not re-flag:\n${controlState.dismissed.join('\n')}`
        : ''

    return `Review this phase plan for work that may already be covered by another phase:

${phaseState.brief}${cleared}

Return either "(clean)" or a bullet list of duplicated items, noting which other phase likely covers them.`
  },
}
