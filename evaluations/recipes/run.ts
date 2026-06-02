import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const recipeName = process.argv[2]

if (!recipeName) {
  console.error('Usage: tsx evaluations/recipes/run.ts <recipe-name>')
  console.error('Example: tsx evaluations/recipes/run.ts synthesize-phases')
  process.exit(1)
}

const dir = fileURLToPath(new URL('.', import.meta.url))
const filePath = resolve(dir, `${recipeName}.ts`)

await import(filePath)
