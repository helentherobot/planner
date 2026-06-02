import { investigatePhaseDuplication } from '@/recipes/investigate-phase-duplication.ts'
import type { ControlRecipeContext, PhaseState, ControlState } from '@/index.ts'
import { runner, defaultProfile, fixtures } from '../config.ts'

const profileName = defaultProfile

if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

const defaultPhase: PhaseState = {
  title: 'Fixture phase',
  brief: '',
  controls: {},
  iterations: 0,
}

const defaultControl: ControlState = { dismissed: [], raised: [] }

const flagsFixture = fixtures.duplication.find((f) => f.name === 'flags-duplication')!

const context: ControlRecipeContext = {
  phase: 0,
  iteration: 0,
  phaseState: { ...defaultPhase, ...flagsFixture.phase } as PhaseState,
  controlState: {
    ...defaultControl,
    ...flagsFixture.control,
    raised: [
      {
        path: 'src/middleware/auth.ts — implement JWT verification middleware for all protected routes',
        reason: 'cross-cutting system-wide work, belongs in a dedicated auth phase',
      },
    ],
  },
}

console.log(`investigate-phase-duplication — profile: ${profileName}`)
console.log('Investigating raised duplication issues')
console.log()

const result = await runner.run({ ...investigatePhaseDuplication, profile: profileName }, [context])

console.log('Output:')
console.log(result.text)
console.log()
console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
