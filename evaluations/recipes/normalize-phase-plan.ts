import { normalizePhasePlan } from '@/recipes/normalize-phase-plan.ts'
import type { PhaseState } from '@/index.ts'
import { runner, defaultProfile } from '../config.ts'

const profileName = defaultProfile

if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const phaseState: PhaseState = {
  title: 'Rate limiting middleware',
  brief: `here's what we need to do for rate limiting:

- add the express-rate-limit package. it should be 100 req/min per IP
- there's an env var for this (RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS)
- if someone hits the limit send 429 back with Retry-After
- probably put the middleware in src/middleware somewhere
- tests too I guess`,
  controls: {},
  iterations: 0,
}

console.log(`normalize-phase-plan — profile: ${profileName}`)
console.log()

const result = await runner.run({ ...normalizePhasePlan, profile: profileName }, [
  { phase: 0, phaseState },
])

console.log('Output:')
console.log(result.text)
console.log()
console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
