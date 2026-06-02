import { revisePhase } from '@/recipes/revise-phase.ts'
import type { PhaseState } from '@/index.ts'
import { runner, defaultProfile } from '../config.ts'

const profileName = defaultProfile

if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const phaseState: PhaseState = {
  title: 'Rate limiting middleware',
  brief: `Implement rate limiting for the public API.

Steps:
- Set up rate limiting middleware somewhere in the middleware folder
- Configure the limits as needed
- Handle errors appropriately
- Write tests`,
  controls: {},
  iterations: 1,
}

const issues = [
  '"somewhere in the middleware folder" is vague — specify the exact file path src/middleware/rateLimiter.ts',
  '"Configure the limits as needed" is vague — specify 100 requests per minute per IP, driven by RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS env vars',
]

console.log(`revise-phase — profile: ${profileName}`)
console.log()

const result = await runner.run({ ...revisePhase, profile: profileName }, [
  { phase: 0, phaseState, issues },
])

console.log('Output:')
console.log(result.text)
console.log()
console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
