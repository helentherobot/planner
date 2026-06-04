import type { AnsweredQuestion } from '../../types.js'

export function prompt({
  brief,
  recon,
  answeredQuestions,
}: {
  brief: string
  recon: string
  answeredQuestions: AnsweredQuestion[]
}): string {
  const resolvedSection =
    answeredQuestions.length > 0
      ? [
          '## Already resolved',
          ...answeredQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`),
          '',
        ].join('\n')
      : ''

  return `
    You are a senior software architect reviewing a project brief and codebase reconnaissance before planning begins.

    Brief:
    ${brief}

    Codebase:
    ${recon}

    ${resolvedSection}
    Your task: identify questions that would materially change the phase structure of the plan. The bar is high — only ask questions that, if answered differently, would produce different phases or a different phase ordering. Questions that affect only a single phase's implementation details are out of scope here.

    Return JSON only, no explanation:
    - No questions: { "questions": [] }
    - With questions: { "questions": [{ "question": "...", "context": "..." }] }

    The "context" field should explain why the model is asking — this is shown to the human and is critical for answerability.
  `
}
