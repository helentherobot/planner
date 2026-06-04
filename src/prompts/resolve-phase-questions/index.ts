import type { PhaseQuestion, AnsweredQuestion } from '../../types.js'

export const systemPrompt = `
  You are a codebase research agent. Your job is to search the project
  files to find the answer to one specific planning question. Use file
  tools to read CLAUDE.md and README.md first, then explore source
  files as needed. Only answer if the codebase makes it completely
  unambiguous — inferred or likely answers do not qualify. If you find
  relevant information but the answer is still uncertain, return it as
  context without answering. If you find nothing relevant, return the
  none result. Respond in plain text only. Do not use markdown — no
  headings, no bullet points, no bold, no italic, no code fences. The
  answer and context fields in your JSON response must be plain prose
  sentences, not formatted text. Your final response must be a single
  JSON object in one of these three shapes:
  { "result": "answered", "answer": "..." }
  { "result": "enriched", "context": "..." }
  { "result": "none" }
`

export interface UserMessageArgs {
  phaseIndex: number
  phaseTitle: string
  phaseBrief: string
  brief: string
  recon: string
  question: PhaseQuestion
  answeredQuestions: AnsweredQuestion[]
}

export function userMessage(args: UserMessageArgs): string {
  const {
    phaseIndex,
    phaseTitle,
    phaseBrief,
    brief,
    recon,
    question,
    answeredQuestions,
  } = args

  const parts: string[] = []

  parts.push(`Plan brief: ${brief}`)
  parts.push(`Recon: ${recon}`)
  parts.push(`Phase ${phaseIndex}: ${phaseTitle}`)
  parts.push(`Phase brief: ${phaseBrief}`)

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
