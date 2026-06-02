import type { PhaseState } from '../../types.js'

export function prompt({ phaseState }: { phase: number; phaseState: PhaseState }): string {
  return `
    Clean up the following implementation plan. Fix any prose issues, inconsistent formatting, or unclear wording. Do not change the substance — only improve clarity and style.

    Plan:
    ${phaseState.brief}

    Output only the cleaned plan, nothing else.
  `
}
