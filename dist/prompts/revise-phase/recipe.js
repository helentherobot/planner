export function prompt({ phase, phaseState, issues, answeredQuestions, }) {
    const issueList = issues.map((issue) => `- ${issue}`).join('\n');
    const resolved = answeredQuestions
        .map((q) => `Q: ${q.question}\nA: ${q.answer}`)
        .join('\n');
    const resolvedSection = answeredQuestions.length > 0
        ? `Resolved decisions — treat these as settled:\n${resolved}`
        : '';
    return `
    Revise the following implementation plan for
    phase ${phase + 1}: ${phaseState.title}.

    ${resolvedSection}

    The following issues have been confirmed and must be addressed:
    ${issueList}

    Current plan:
    ${phaseState.brief}

    Produce a revised plan that fixes all listed issues. Do not
    introduce new problems. Output only the revised plan, nothing else.
    Respond in plain text only — no headings, no bold, no italic, no
    code fences.
  `;
}
