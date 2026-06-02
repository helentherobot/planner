import type { ControlRecipeContext } from '@/types.js'

export function prompt({ phaseState, controlState, otherPhases }: ControlRecipeContext): string {
  const dismissed = controlState.dismissed.map((d) => `${d.path} — ${d.reason}`).join('\n')

  const cleared =
    controlState.dismissed.length > 0 ? `CLEARED ITEMS — do not flag these: ${dismissed}` : ''

  const crossPhaseBlock =
    otherPhases.length > 0
      ? 'Work already planned in other phases — flag anything in this phase that duplicates what another phase intends:\n\n' +
        otherPhases.map((p) => `Phase ${p.index + 1} (${p.title}):\n${p.fileIndex}`).join('\n\n') +
        '\n\n'
      : ''

  return `
    ${cleared}

    Review this phase plan for work that is cross-cutting or foundational and clearly does not belong in this specific phase. Only flag concrete tasks (not context-setting prose). Do not flag work specific to this feature even if it touches shared files.

    ${crossPhaseBlock}Plan:
    ${phaseState.brief}

    Return a JSON object: { "findings": [] } if clean, or { "findings": [{ "path": "<item name only, no explanation>", "reason": "<why it belongs in a different phase>" }] }. Do not include cleared items. Output only the JSON.
  `
}
