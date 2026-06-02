import type { ControlRecipeContext } from '@/types.js'

export function prompt({ phaseState, controlState }: ControlRecipeContext): string {
  const issues = controlState.raised.map((f, i) => `${i + 1}. ${f.path} — ${f.reason}`).join('\n')
  const dismissed = controlState.dismissed.map((d) => `${d.path} — ${d.reason}`).join('\n')
  const history =
    controlState.dismissed.length > 0
      ? `Previously cleared (do not re-confirm unless the plan has materially changed):\n${dismissed}`
      : ''

  return `
    The following vagueness issues were flagged in this phase plan:

    ${issues}

    ${history}

    Plan:
    ${phaseState.brief}

    For each issue, decide: is it a genuine problem that needs fixing, or a false positive?

    Return a JSON object with two arrays:
    - "confirmed": array of issue numbers (e.g. [1, 3]) for issues that are real problems
    - "dismissed": array of issue numbers (e.g. [2]) for false positives

    Output only the JSON, nothing else.
  `
}
