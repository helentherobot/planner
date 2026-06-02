export function prompt({ brief, recon }: { brief: string; recon: string }): string {
  return `
    You are a senior software architect. Given the following project brief and codebase reconnaissance, produce an ordered list of implementation phases.

    Brief:
    ${brief}

    Codebase:
    ${recon}

    Use the minimum number of phases needed — if the brief describes a single file change, that is one phase. Do not manufacture phases. A small change should have 1-2 phases; a large feature might have 5-8. Never split a single coherent change into multiple phases just to be thorough.

    Return a numbered list of phase titles only — one per line, no descriptions. Each phase title should be concise and specific (e.g. "Database schema and migrations", "Authentication middleware").

    Important: do not include phases for committing, merging, deploying, or reviewing — these are handled automatically. Only list phases that represent concrete implementation work.
  `
}
