export function prompt({ phaseState, }) {
    return `
    Clean up the following implementation plan. Fix any prose issues,
    inconsistent formatting, or unclear wording. Do not change the
    substance — only improve clarity and style.

    Plan:
    ${phaseState.brief}

    Output only the cleaned plan, nothing else. Respond in plain text
    only — no headings, no bold, no italic, no code fences.
  `;
}
