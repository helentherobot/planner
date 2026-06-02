import type { PhaseState } from '../../types.js'

export function prompt({
  phase,
  phaseState,
  recon,
}: {
  phase: number
  phaseState: PhaseState
  recon: string
}): string {
  const reconSection = recon ? `Codebase reconnaissance:\n${recon}` : ''

  return `
    Rewrite the following phase preamble as a clear prompt for a PLANNING agent.

    The planning agent's job is to produce a detailed implementation plan — specifying exactly which files to change, what content they should contain, and why. The planning agent does NOT make changes; it writes a plan that a separate coding agent will execute later.

    Phase ${phase + 1}: ${phaseState.title}

    ${reconSection}

    Current preamble:
    ${phaseState.brief}

    Rules:
    - Frame the prompt as "Write a detailed implementation plan for..." NOT "You are implementing..."
    - The plan should specify files, content, and rationale in enough detail that a developer could execute it without guessing
    - Include relevant context from the codebase reconnaissance if present
    - Do not include meta-instructions about how to respond
    - Output only the rewritten prompt, nothing else
  `
}
