import { describe, it, expect } from 'vitest'
import { resolveOptions } from '../src/helpers.js'
import type { Adapters } from '../src/types.js'

function makeAdapters(
  taskOptions?: Record<string, { jsonMode?: boolean }>,
): Pick<Adapters, 'config'> {
  return {
    config: {
      maxFilesPerPhase: 10,
      minIterations: 1,
      maxIterations: 5,
      taskOptions,
    },
  }
}

describe('resolveOptions', () => {
  it('returns the entry when taskOptions has the given taskType', () => {
    const adapters = makeAdapters({
      'resolve-phase-questions': { jsonMode: true },
    })
    const result = resolveOptions(adapters, 'resolve-phase-questions')
    expect(result).toEqual({ jsonMode: true })
  })

  it('returns {} when taskOptions does not have the given taskType', () => {
    const adapters = makeAdapters({
      'gather-recon': { jsonMode: false },
    })
    const result = resolveOptions(adapters, 'resolve-phase-questions')
    expect(result).toEqual({})
  })

  it('returns {} when taskOptions is undefined on config', () => {
    const adapters = makeAdapters(undefined)
    const result = resolveOptions(adapters, 'resolve-phase-questions')
    expect(result).toEqual({})
  })
})
