import type { Recipe } from '@helentherobot/runner'
import type { PhaseState, ControlState } from './types.js'
import { checkPhaseVagueness } from './recipes/check-phase-vagueness.js'
import { investigatePhaseVagueness } from './recipes/investigate-phase-vagueness.js'
import { checkPhaseDuplication } from './recipes/check-phase-duplication.js'
import { investigatePhaseDuplication } from './recipes/investigate-phase-duplication.js'
import { checkPhaseScope } from './recipes/check-phase-scope.js'
import { investigatePhaseScope } from './recipes/investigate-phase-scope.js'

export interface ControlRecipeContext {
  phase: number
  iteration: number
  phaseState: PhaseState
  controlState: ControlState
}

export interface QualityControl {
  name: string
  checkRecipe: Recipe<[context: ControlRecipeContext]>
  investigateRecipe: Recipe<[context: ControlRecipeContext]>
}

export const vaguenessControl: QualityControl = {
  name: 'vagueness',
  checkRecipe: checkPhaseVagueness,
  investigateRecipe: investigatePhaseVagueness,
}

export const duplicationControl: QualityControl = {
  name: 'duplication',
  checkRecipe: checkPhaseDuplication,
  investigateRecipe: investigatePhaseDuplication,
}

export const scopeControl: QualityControl = {
  name: 'scope',
  checkRecipe: checkPhaseScope,
  investigateRecipe: investigatePhaseScope,
}

export const defaultControls: QualityControl[] = [
  vaguenessControl,
  duplicationControl,
  scopeControl,
]
