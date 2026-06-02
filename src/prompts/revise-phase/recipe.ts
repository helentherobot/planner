import type { PhaseState } from '../../types.js'

export function prompt({
  phase,
  phaseState,
  issues,
}: {
  phase: number
  phaseState: PhaseState
  issues: string[]
}): string {
  const issueList = issues.map((issue) => `- ${issue}`).join('\n')

  return `
    Revise the following implementation plan for phase ${phase + 1}: ${phaseState.title}.

    The following issues have been confirmed and must be addressed:
    ${issueList}

    Current plan:
    ${phaseState.brief}

    Produce a revised plan that fixes all listed issues. Do not introduce new problems. Output only the revised plan, nothing else.
  `
}
