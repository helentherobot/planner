import type { Recipe } from '@helentherobot/runner'
import type { ControlRecipeContext } from '../checks.js'

export const checkPhaseScope: Recipe<[ControlRecipeContext]> = {
  profile: 'haiku',
  prompt: ({ phaseState, controlState }) => {
    const cleared =
      controlState.dismissed.length > 0
        ? `\nPreviously reviewed and cleared — do not re-flag:\n${controlState.dismissed.join('\n')}`
        : ''

    const authorisedFiles = phaseState.index
      ? `\nAuthorised files for this phase:\n${phaseState.index}`
      : ''

    return `Review this phase plan for files that appear to be out of scope:

${phaseState.brief}${authorisedFiles}${cleared}

Return either "(clean)" or a bullet list of out-of-scope files with a brief reason for each.`
  },
}
