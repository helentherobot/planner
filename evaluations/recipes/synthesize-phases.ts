import { synthesizePhases } from '@/recipes/synthesize-phases.ts'
import { runner, defaultProfile, prompts } from '../config.ts'

const profileName = defaultProfile

if (!profileName) {
  console.error('No profiles configured in evaluations/config.ts')
  process.exit(1)
}

console.log(`synthesize-phases — profile: ${profileName}`)
console.log('Brief:', prompts.tiny)
console.log()

const result = await runner.run({ ...synthesizePhases, profile: profileName }, [
  { brief: prompts.tiny, recon: '' },
])

console.log('Output:')
console.log(result.text)
console.log()
console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`)
