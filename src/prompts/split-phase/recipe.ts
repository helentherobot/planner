import type { PhaseState } from '../../types.js'

export function prompt({
  phaseState,
  maxFiles,
}: {
  phase: number
  phaseState: PhaseState
  maxFiles: number
}): string {
  return `
    The following implementation plan contains more than ${maxFiles} files. Split it into two or more smaller phases, each with at most ${maxFiles} files.

    Plan:
    ${phaseState.brief}

    Rules:
    - Each sub-phase must be independently implementable
    - Group logically related files together
    - Output a JSON array of objects with shape { "title": string, "brief": string }
    - The "title" field is a short descriptive label, plain prose, no markdown
    - The "brief" field is the implementation plan for the sub-phase, plain prose only — no headings, no bold, no italic, no code fences
    - Do not include any other text outside the JSON array
  `
}
