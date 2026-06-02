import { normalizePhasePrompt } from '@/recipes/normalize-phase-prompt.ts'
import type { PhaseState } from '@/index.ts'
import { runner, defaultProfile } from '../config.ts'

const profileName = defaultProfile

if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const phaseState: PhaseState = {
  title: 'Rate limiting middleware',
  brief:
    'Add rate limiting to the public API. Use express-rate-limit. 100 req/min per IP. Return 429 with Retry-After header. Config via env vars.',
  controls: {},
  iterations: 0,
}

console.log(`normalize-phase-prompt — profile: ${profileName}`)
console.log()

const result = await runner.run({ ...normalizePhasePrompt, profile: profileName }, [
  { phase: 0, phaseState },
])

console.log('Output:')
console.log(result.text)
console.log()
console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
