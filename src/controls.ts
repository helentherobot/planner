import type { QualityControl, ControlFinding, Store } from './types.js'
import { updatePhase } from './helpers.js'
import { prompt as vaguenessCheck } from './prompts/check-phase/vagueness-check.js'
import { prompt as vaguenessInvestigation } from './prompts/check-phase/vagueness-investigation.js'
import { prompt as duplicationCheck } from './prompts/check-phase/duplication-check.js'
import { prompt as duplicationInvestigation } from './prompts/check-phase/duplication-investigation.js'
import { prompt as scopeCheck } from './prompts/check-phase/scope-check.js'
import { prompt as scopeInvestigation } from './prompts/check-phase/scope-investigation.js'

export const vaguenessControl: QualityControl = {
  name: 'vagueness',
  checkRecipe: { profile: '', prompt: vaguenessCheck },
  investigateRecipe: { profile: '', prompt: vaguenessInvestigation },
}

export const duplicationControl: QualityControl = {
  name: 'duplication',
  checkRecipe: { profile: '', prompt: duplicationCheck },
  investigateRecipe: { profile: '', prompt: duplicationInvestigation },
}

function addToIndex(
  dismissed: ControlFinding[],
  phase: number,
  store: Store,
): void {
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
  checkRecipe: { profile: '', prompt: scopeCheck },
  investigateRecipe: { profile: '', prompt: scopeInvestigation },
  afterInvestigate: addToIndex,
}

export const defaultControls: QualityControl[] = [
  vaguenessControl,
  duplicationControl,
  scopeControl,
]
