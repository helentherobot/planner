import { planPhase } from '@/recipes/plan-phase.ts'
import type { PhaseState } from '@/index.ts'
import { runner, defaultProfile } from '../config.ts'

const profileName = defaultProfile

if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const phaseState: PhaseState = {
  title: 'Rate limiting middleware',
  brief: 'Add rate limiting to the public API endpoints.',
  controls: {},
  iterations: 0,
}

console.log(`plan-phase — profile: ${profileName}`)
console.log('Phase:', phaseState.title)
console.log()

const result = await runner.run({ ...planPhase, profile: profileName }, [{ phase: 0, phaseState }])

console.log('Output:')
console.log(result.text)
console.log()
console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
