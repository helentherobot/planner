import type { Question } from '../../types.js'

export function prompt({
  question,
  answer,
  directPhaseIndex,
  phaseTitles,
}: {
  question: Question
  answer: string
  directPhaseIndex: number | number[]
  phaseTitles: Array<{ index: number; title: string }>
}): string {
  const directPhases = Array.isArray(directPhaseIndex)
    ? directPhaseIndex
    : [directPhaseIndex]

  return `
    You are reviewing an answered question to determine which phases
    of a plan should be revised.

    The following question has been answered:
    Q: ${question.question}
    A: ${answer}

    Phases already identified as directly affected (no need to include
    these): ${directPhases.join(', ')}

    All phases:
    ${phaseTitles.map((p) => `- Phase ${p.index}: ${p.title}`).join('\n')}

    Determine which additional phases (beyond the ones already
    identified) would benefit from revision in light of this answer.
    Be conservative — only include phases where the answer would
    materially change the implementation plan.

    Return JSON only, no explanation:
    - No additional phases: { "additionalPhases": [] }
    - With additional phases: { "additionalPhases": [2, 4] }
  `
}
