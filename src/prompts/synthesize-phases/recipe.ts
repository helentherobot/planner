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
          '## Resolved decisions',
          'The following questions have been answered — treat these as settled decisions when designing phases:',
          ...answeredQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`),
          '',
        ].join('\n')
      : ''

  return `
    You are a senior software architect. Given the following project brief and codebase reconnaissance, produce an ordered list of implementation phases.

    ${resolvedSection}

    Brief:
    ${brief}

    Codebase:
    ${recon}

    Use the minimum number of phases needed — if the brief describes a single file change, that is one phase. Do not manufacture phases. A small change should have 1-2 phases; a large feature might have 5-8. Never split a single coherent change into multiple phases just to be thorough.

    Return a numbered list of phase titles only — one per line, no descriptions. Each phase title should be concise and specific (e.g. "Database schema and migrations", "Authentication middleware").

    Important: do not include phases for committing, merging, deploying, or reviewing — these are handled automatically. Only list phases that represent concrete implementation work.
  `
}
