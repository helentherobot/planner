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
`;
export function userMessage(args) {
    const { phaseIndex, phaseTitle, question, answeredQuestions, otherPhases } = args;
    const parts = [];
    if (otherPhases.length > 0) {
        parts.push('Other phases in this plan (title and file index only — do not ' +
            'assume their contents; use file tools to verify):');
        for (const p of otherPhases) {
            const index = p.fileIndex.trim()
                ? `\n${p.fileIndex}`
                : ' (no file index yet)';
            parts.push(`Phase ${p.index + 1} — ${p.title}:${index}`);
        }
    }
    parts.push(`Phase ${phaseIndex + 1}: ${phaseTitle}`);
    if (answeredQuestions.length > 0) {
        parts.push('Previously answered questions:');
        for (const aq of answeredQuestions) {
            parts.push(`- ${aq.question}: ${aq.answer}`);
        }
    }
    parts.push(`Question to research: ${question.question}`);
    if (question.context) {
        parts.push(`Additional context: ${question.context}`);
    }
    parts.push('Search the codebase and return one of the three JSON result' +
        ' shapes described in your instructions.');
    return parts.join('\n');
}
