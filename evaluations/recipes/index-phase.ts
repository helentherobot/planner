import { indexPhase } from '@/recipes/index-phase.ts'
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

**Files to create or modify:**

- \`src/middleware/rateLimiter.ts\` — Create the rate limiting middleware using \`express-rate-limit\`. Configure 100 requests per minute per IP address using \`RATE_LIMIT_MAX\` and \`RATE_LIMIT_WINDOW_MS\` environment variables with sensible defaults.
- \`src/app.ts\` — Apply the rate limiter middleware to all \`/api\` routes before the route handlers.
- \`tests/middleware/rateLimiter.test.ts\` — Unit tests covering the middleware configuration and the 429 response with \`Retry-After\` header.`,
  controls: {},
  iterations: 0,
}

console.log(`index-phase — profile: ${profileName}`)
console.log()

const result = await runner.run({ ...indexPhase, profile: profileName }, [{ phase: 0, phaseState }])

console.log('Output:')
console.log(result.text)
console.log()
console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
