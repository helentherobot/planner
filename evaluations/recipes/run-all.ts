import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('.', import.meta.url))

const recipes = [
  'synthesize-phases',
  'plan-phase',
  'normalize-phase-plan',
  'normalize-phase-prompt',
  'index-phase',
  'split-phase',
  'revise-phase',
  'check-phase-vagueness',
  'investigate-phase-vagueness',
  'check-phase-duplication',
  'investigate-phase-duplication',
  'check-phase-scope',
  'investigate-phase-scope',
]

for (const name of recipes) {
  console.log('='.repeat(60))
  console.log(`RECIPE: ${name}`)
  console.log('='.repeat(60))

  try {
    await import(resolve(dir, `${name}.ts`))
  } catch (err) {
    console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  console.log()
}

console.log('All recipe evaluations complete.')
