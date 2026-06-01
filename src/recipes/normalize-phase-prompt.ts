import type { Recipe } from '@helentherobot/runner'
import type { PhaseState } from '../types.js'

export const normalizePhasePrompt: Recipe<[{ phase: number; phaseState: PhaseState }]> = {
  profile: 'haiku',
  prompt: ({
    phase,
    phaseState,
  }) => `Rewrite the following phase preamble as a clear, direct agent prompt. The prompt will be given verbatim to a coding agent.

Phase ${phase + 1}: ${phaseState.title}

Current preamble:
${phaseState.brief}

Rules:
- Address the agent directly ("You are implementing...")
- Be specific about what files to create and what they should do
- Do not include meta-instructions about how to respond
- Output only the rewritten prompt, nothing else`,
}
