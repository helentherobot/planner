import type { Recipe } from '@helentherobot/runner'
import type { PhaseState } from '../types.js'

export const revisePhase: Recipe<[{ phase: number; phaseState: PhaseState; issues: string[] }]> = {
  profile: 'sonnet',
  prompt: ({
    phase,
    phaseState,
    issues,
  }) => `Revise the following implementation plan for phase ${phase + 1}: ${phaseState.title}.

The following issues have been confirmed and must be addressed:
${issues.map((issue) => `- ${issue}`).join('\n')}

Current plan:
${phaseState.brief}

Produce a revised plan that fixes all listed issues. Do not introduce new problems. Output only the revised plan, nothing else.`,
}
