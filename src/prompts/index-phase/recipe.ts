import type { PhaseState } from '@/types.js'

export function prompt({ phaseState }: { phase: number; phaseState: PhaseState }): string {
  return `
    Extract a flat list of all file paths mentioned in the following implementation plan.

    Plan:
    ${phaseState.brief}

    Rules:
    - Include every file path that will be created or modified
    - One path per line, no bullet points or numbers
    - Paths should be relative to the project root (e.g. src/foo/bar.ts)
    - Do not include directories, only files

    Output the list only, nothing else.
  `
}
