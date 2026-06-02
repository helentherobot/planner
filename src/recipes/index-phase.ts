import type { Recipe } from '@helentherobot/runner'
import type { PhaseState } from '@/types.js'

export const indexPhase: Recipe<[{ phase: number; phaseState: PhaseState }]> = {
  profile: '',
  prompt: ({
    phaseState,
  }) => `Extract a flat list of all file paths mentioned in the following implementation plan.

Plan:
${phaseState.brief}

Rules:
- Include every file path that will be created or modified
- One path per line, no bullet points or numbers
- Paths should be relative to the project root (e.g. src/foo/bar.ts)
- Do not include directories, only files

Output the list only, nothing else.`,
}
