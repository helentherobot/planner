import { investigatePhaseVagueness } from '@/recipes/investigate-phase-vagueness.ts'
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

const flagsFixture = fixtures.vagueness.find((f) => f.name === 'flags-vague-steps')!

const context: ControlRecipeContext = {
  phase: 0,
  iteration: 0,
  phaseState: { ...defaultPhase, ...flagsFixture.phase } as PhaseState,
  controlState: {
    ...defaultControl,
    ...flagsFixture.control,
    raised: [
      { path: 'Configure the limits appropriately', reason: 'no specific values given' },
      {
        path: 'Handle errors in a reasonable way',
        reason: 'no specific status codes or messages defined',
      },
    ],
  },
}

console.log(`investigate-phase-vagueness — profile: ${profileName}`)
console.log('Investigating raised vagueness issues')
console.log()

const result = await runner.run({ ...investigatePhaseVagueness, profile: profileName }, [context])

console.log('Output:')
console.log(result.text)
console.log()
console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
