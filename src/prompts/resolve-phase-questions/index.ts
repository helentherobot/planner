import type { PhaseQuestion, AnsweredQuestion } from '../../types.js'

export const systemPrompt = `
  You are a codebase research agent. Your job is to search the project
  files to find the answer to one specific planning question.

  CRITICAL OUTPUT RULE: Your entire response must be valid JSON only.
  Do not write any prose, explanation, preamble, or thinking text outside
  the JSON object. Do not use markdown. Do not use code fences. Output
  exactly one of these three JSON objects and nothing else:
  { "result": "answered", "answer": "..." }
  { "result": "enriched", "context": "..." }
  { "result": "none" }

  Use file tools to read CLAUDE.md and README.md first, then explore
  source files as needed. Only answer if the codebase makes it completely
  unambiguous — inferred or likely answers do not qualify. If you find
  relevant information but the answer is still uncertain, use "enriched"
  with the context. If you find nothing relevant, use "none". The answer
  and context fields must be plain prose sentences only — no markdown, no
  bullet points, no headings, no code fences.
`

export interface UserMessageArgs {
  phaseIndex: number
  phaseTitle: string
  question: PhaseQuestion
  answeredQuestions: AnsweredQuestion[]
  otherPhases: Array<{ index: number; title: string; fileIndex: string }>
}

export function userMessage(args: UserMessageArgs): string {
  const { phaseIndex, phaseTitle, question, answeredQuestions, otherPhases } =
    args

  const parts: string[] = []

  if (otherPhases.length > 0) {
    parts.push(
      'Other phases in this plan (title and file index only — do not ' +
        'assume their contents; use file tools to verify):',
    )
    for (const p of otherPhases) {
      const index = p.fileIndex.trim()
        ? `\n${p.fileIndex}`
        : ' (no file index yet)'
      parts.push(`Phase ${p.index + 1} — ${p.title}:${index}`)
    }
  }

  parts.push(`Phase ${phaseIndex + 1}: ${phaseTitle}`)

  if (answeredQuestions.length > 0) {
    parts.push('Previously answered questions:')
    for (const aq of answeredQuestions) {
      parts.push(`- ${aq.question}: ${aq.answer}`)
    }
  }

  parts.push(`Question to research: ${question.question}`)

  if (question.context) {
    parts.push(`Additional context: ${question.context}`)
  }

  parts.push(
    'Search the codebase and return one of the three JSON result' +
      ' shapes described in your instructions.',
  )

  return parts.join('\n')
}
