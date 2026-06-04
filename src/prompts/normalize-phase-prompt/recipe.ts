import type { PhaseState, AnsweredQuestion } from '../../types.js'

export function prompt({
  phase,
  phaseState,
  recon,
  answeredQuestions,
}: {
  phase: number
  phaseState: PhaseState
  recon: string
  answeredQuestions: AnsweredQuestion[]
}): string {
  const reconSection = recon ? `Codebase reconnaissance:\n${recon}` : ''
  const resolved = answeredQuestions
    .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
    .join('\n')
  const resolvedSection =
    answeredQuestions.length > 0
      ? `Resolved decisions — treat these as settled:\n${resolved}`
      : ''

  return `
    Rewrite the following phase preamble as a clear prompt for a PLANNING agent.

    The planning agent's job is to produce a detailed implementation
    plan — specifying exactly which files to change, what content they
    should contain, and why. The planning agent does NOT make changes;
    it writes a plan that a separate coding agent will execute
    later.

    Phase ${phase + 1}: ${phaseState.title}

    ${resolvedSection}

    ${reconSection}

    Current preamble:
    ${phaseState.brief}

    Rules:
    - Frame the prompt as "Write a detailed implementation plan for..."
      NOT "You are implementing..."
    - The plan should specify files, content, and rationale in enough
      detail that a developer could execute it without guessing
    - Include relevant context from the codebase reconnaissance if present
    - Do not include meta-instructions about how to respond
    - Output only the rewritten prompt, nothing else. Respond in plain
      text only — no headings, no bold, no italic, no code fences.
  `
}
