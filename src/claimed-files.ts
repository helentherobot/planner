import type { PhaseState } from './types.js'

export function readClaimedFiles(phases: PhaseState[], currentPhase: number): string[] {
  const claimed: string[] = []

  for (let i = 0; i < phases.length; i++) {
    if (i === currentPhase) continue
    const index = phases[i].index
    if (!index) continue
    for (const line of index.split('\n')) {
      const trimmed = line.trim()
      if (trimmed) claimed.push(trimmed)
    }
  }

  return claimed
}
