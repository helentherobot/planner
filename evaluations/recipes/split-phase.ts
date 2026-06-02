import { splitPhase } from '@/recipes/split-phase.ts'
import type { PhaseState } from '@/index.ts'
import { runner, defaultProfile } from '../config.ts'

const profileName = defaultProfile

if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const phaseState: PhaseState = {
  title: 'Full authentication system',
  brief: `Implement the complete authentication system.

Files:
- \`src/models/user.ts\` — User model with name, email, passwordHash, role
- \`src/models/session.ts\` — Session model with token, userId, expiresAt
- \`src/models/refreshToken.ts\` — Refresh token model
- \`migrations/001_create_users.sql\`
- \`migrations/002_create_sessions.sql\`
- \`migrations/003_create_refresh_tokens.sql\`
- \`src/services/auth.ts\` — login, logout, refresh, validate
- \`src/services/password.ts\` — bcrypt hash and compare helpers
- \`src/services/token.ts\` — JWT sign and verify
- \`src/middleware/auth.ts\` — authenticate middleware
- \`src/routes/auth.ts\` — POST /auth/login, POST /auth/logout, POST /auth/refresh
- \`src/routes/me.ts\` — GET /me
- \`tests/services/auth.test.ts\`
- \`tests/services/password.test.ts\`
- \`tests/services/token.test.ts\`
- \`tests/middleware/auth.test.ts\``,
  controls: {},
  iterations: 0,
}

const maxFiles = 8

console.log(`split-phase — profile: ${profileName}`)
console.log(`Splitting phase with ${maxFiles} max files`)
console.log()

const result = await runner.run({ ...splitPhase, profile: profileName }, [
  { phase: 0, phaseState, maxFiles },
])

console.log('Output:')
console.log(result.text)
console.log()
console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
