import type { Recipe } from '@helentherobot/runner'
import type { PhaseState } from '../types.js'

export const normalizePhasePlan: Recipe<[{ phase: number; phaseState: PhaseState }]> = {
  profile: 'haiku',
  prompt: ({
    phaseState,
  }) => `Clean up the following implementation plan. Fix any prose issues, inconsistent formatting, or unclear wording. Do not change the substance — only improve clarity and style.

Plan:
${phaseState.brief}

Output only the cleaned plan, nothing else.`,
}
