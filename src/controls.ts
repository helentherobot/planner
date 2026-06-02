import type { QualityControl, ControlFinding, Store } from '@/types.js'
import { updatePhase } from '@/helpers.js'
import { checkPhaseVagueness } from '@/recipes/check-phase-vagueness.js'
import { investigatePhaseVagueness } from '@/recipes/investigate-phase-vagueness.js'
import { checkPhaseDuplication } from '@/recipes/check-phase-duplication.js'
import { investigatePhaseDuplication } from '@/recipes/investigate-phase-duplication.js'
import { checkPhaseScope } from '@/recipes/check-phase-scope.js'
import { investigatePhaseScope } from '@/recipes/investigate-phase-scope.js'

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

function addToIndex(dismissed: ControlFinding[], phase: number, store: Store): void {
  const state = store.read()
  if (!state) return
  const phaseState = state.phases[phase]
  if (!phaseState) return
  const existing = new Set(
    (phaseState.index ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  )
  const added = dismissed.map((f) => f.path).filter((p) => !existing.has(p))
  if (added.length === 0) return
  const newIndex = [...existing, ...added].join('\n')
  updatePhase(store, phase, { index: newIndex })
}

export const scopeControl: QualityControl = {
  name: 'scope',
  checkRecipe: checkPhaseScope,
  investigateRecipe: investigatePhaseScope,
  afterInvestigate: addToIndex,
}

export const defaultControls: QualityControl[] = [
  vaguenessControl,
  duplicationControl,
  scopeControl,
]
