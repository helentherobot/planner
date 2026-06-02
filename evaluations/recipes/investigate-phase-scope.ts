import { investigatePhaseScope } from '@/recipes/investigate-phase-scope.ts'
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

const flagsFixture = fixtures.scope.find((f) => f.name === 'flags-out-of-scope-files')!

const context: ControlRecipeContext = {
  phase: 0,
  iteration: 0,
  phaseState: { ...defaultPhase, ...flagsFixture.phase } as PhaseState,
  controlState: {
    ...defaultControl,
    ...flagsFixture.control,
    raised: [
      {
        path: 'src/middleware/auth.ts',
        reason: 'not listed in the authorised file index for this phase',
      },
    ],
  },
}

console.log(`investigate-phase-scope — profile: ${profileName}`)
console.log('Investigating raised scope issues')
console.log()

const result = await runner.run({ ...investigatePhaseScope, profile: profileName }, [context])

console.log('Output:')
console.log(result.text)
console.log()
console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
