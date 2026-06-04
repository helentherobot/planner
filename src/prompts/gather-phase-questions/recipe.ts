import type {
  AnsweredQuestion,
  PhaseQuestion,
  PhaseState,
} from '../../types.js'

export function prompt({
  phaseIndex,
  phaseState,
  brief,
  recon,
  answeredQuestions,
  existingPendingQuestions,
}: {
  phaseIndex: number
  phaseState: PhaseState
  brief: string
  recon: string
  answeredQuestions: AnsweredQuestion[]
  existingPendingQuestions: PhaseQuestion[]
}): string {
  const resolved = answeredQuestions
    .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
    .join('\n')
  const resolvedSection =
    answeredQuestions.length > 0 ? `Already resolved:\n${resolved}` : ''

  const existing = existingPendingQuestions
    .map((q) => `- ${q.question}`)
    .join('\n')
  const existingSection =
    existingPendingQuestions.length > 0
      ? `Already pending (do not re-ask):\n${existing}`
      : ''

  return `
    You are reviewing a phase's implementation plan to identify
    questions that, if answered, would improve or correct it.

    Brief:
    ${brief}

    Codebase:
    ${recon}

    Phase ${phaseIndex} implementation plan:
    ${phaseState.brief}

    ${resolvedSection}

    ${existingSection}

    These questions will be collected and presented to the human after
    planning completes — they do not pause execution. Exclude anything
    already resolved or already pending above.

    Return JSON only, no explanation:
    - No questions: { "questions": [] }
    - With questions: { "questions": [{ "question": "...", "context": "..." }] }

    The "question" field is a plain prose sentence — the question
    itself, no markdown.
    The "context" field explains why the model is asking, as a plain
    prose sentence — this is shown to the human and is critical for
    answerability. No markdown.
  `
}
