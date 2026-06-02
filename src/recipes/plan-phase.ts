import type { Recipe } from '@helentherobot/runner'
import type { PhaseState } from '@/types.js'

export const planPhase: Recipe<[{ phase: number; phaseState: PhaseState }]> = {
  profile: '',
  prompt: ({
    phase,
    phaseState,
  }) => `You are planning implementation phase ${phase + 1}: ${phaseState.title}.

${phaseState.prompt ?? phaseState.brief}

Use available tools to explore the project codebase and understand the existing structure. Then write a detailed implementation plan for this phase.

The plan must:
- List every file to be created or modified, with a clear description of the changes
- Be specific enough that a developer could implement it without guessing
- Avoid duplicating work from other phases

When you have finished planning, write the complete plan using __plan_write_phase.`,
}
