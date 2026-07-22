import { describe, it, expect } from 'vitest'
import {
  resolveOptions,
  validateOutput,
  defaultTaskValidation,
  mergeTaskValidation,
} from '../src/helpers.js'
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

describe('validateOutput', () => {
  describe('undefined entry', () => {
    it('returns valid when entry is undefined', () => {
      const result = validateOutput(undefined, 'anything')
      expect(result.valid).toBe(true)
      expect(result.retryPrompt).toBe('')
    })
  })

  describe('minLength', () => {
    const entry = { type: 'minLength' as const, value: 10, maxRetries: 2 }

    it('returns valid when output meets minimum length', () => {
      const result = validateOutput(entry, 'a'.repeat(10))
      expect(result.valid).toBe(true)
      expect(result.retryPrompt).toBe('')
    })

    it('returns valid when output exceeds minimum length', () => {
      const result = validateOutput(entry, 'a'.repeat(20))
      expect(result.valid).toBe(true)
    })

    it('returns invalid with retryPrompt when output is too short', () => {
      const result = validateOutput(entry, 'short')
      expect(result.valid).toBe(false)
      expect(result.retryPrompt).toContain('10')
      expect(result.retryPrompt).toContain('characters')
    })

    it('returns invalid for empty string', () => {
      const result = validateOutput(entry, '')
      expect(result.valid).toBe(false)
    })
  })

  describe('minItems', () => {
    const entry = { type: 'minItems' as const, value: 2, maxRetries: 2 }

    it('returns valid when non-empty line count meets minimum', () => {
      const result = validateOutput(entry, 'Line one\nLine two')
      expect(result.valid).toBe(true)
      expect(result.retryPrompt).toBe('')
    })

    it('returns valid when non-empty line count exceeds minimum', () => {
      const result = validateOutput(entry, 'Line one\nLine two\nLine three')
      expect(result.valid).toBe(true)
    })

    it('returns invalid with retryPrompt when too few non-empty lines', () => {
      const result = validateOutput(entry, 'Only one line')
      expect(result.valid).toBe(false)
      expect(result.retryPrompt).toContain('phase titles')
    })

    it('ignores blank lines when counting', () => {
      const result = validateOutput(entry, 'Line one\n\nLine two')
      expect(result.valid).toBe(true)
    })

    it('returns invalid for empty string', () => {
      const result = validateOutput(entry, '')
      expect(result.valid).toBe(false)
    })
  })

  describe('schema', () => {
    const entry = {
      type: 'schema' as const,
      required: ['result'],
      maxRetries: 2,
    }

    it('returns valid when JSON has all required fields', () => {
      const result = validateOutput(entry, JSON.stringify({ result: 'ok' }))
      expect(result.valid).toBe(true)
      expect(result.retryPrompt).toBe('')
    })

    it('returns valid when JSON has required fields plus extras', () => {
      const result = validateOutput(
        entry,
        JSON.stringify({ result: 'ok', extra: true }),
      )
      expect(result.valid).toBe(true)
    })

    it('returns invalid with retryPrompt when JSON is missing required fields', () => {
      const result = validateOutput(entry, JSON.stringify({ other: 'value' }))
      expect(result.valid).toBe(false)
      expect(result.retryPrompt).toContain('result')
      expect(result.retryPrompt).toContain('JSON')
    })

    it('returns invalid with retryPrompt when output is not valid JSON', () => {
      const result = validateOutput(entry, 'not json at all')
      expect(result.valid).toBe(false)
      expect(result.retryPrompt).toContain('valid JSON')
    })

    it('returns invalid when output is empty', () => {
      const result = validateOutput(entry, '')
      expect(result.valid).toBe(false)
    })

    it('checks multiple required fields', () => {
      const multiEntry = {
        type: 'schema' as const,
        required: ['a', 'b'],
        maxRetries: 1,
      }
      const valid = validateOutput(multiEntry, JSON.stringify({ a: 1, b: 2 }))
      expect(valid.valid).toBe(true)

      const missing = validateOutput(multiEntry, JSON.stringify({ a: 1 }))
      expect(missing.valid).toBe(false)
      expect(missing.retryPrompt).toContain('b')
    })
  })
})

describe('defaultTaskValidation', () => {
  it('has entries for all core task types', () => {
    const types = [
      'gather-recon',
      'plan-phase',
      'normalize-phase-plan',
      'normalize-phase-prompt',
      'synthesize-phases',
      'resolve-phase-questions',
      'index-phase',
    ]
    for (const t of types) {
      expect(defaultTaskValidation[t]).toBeDefined()
    }
  })
})

describe('mergeTaskValidation', () => {
  it('returns defaults when no overrides provided', () => {
    const merged = mergeTaskValidation()
    expect(merged['gather-recon']).toEqual(
      defaultTaskValidation['gather-recon'],
    )
  })

  it('returns defaults when overrides is undefined', () => {
    const merged = mergeTaskValidation(undefined)
    expect(merged['plan-phase']).toEqual(defaultTaskValidation['plan-phase'])
  })

  it('overrides a default entry when key matches', () => {
    const override = { type: 'minLength' as const, value: 9999, maxRetries: 5 }
    const merged = mergeTaskValidation({ 'gather-recon': override })
    expect(merged['gather-recon']).toEqual(override)
    expect(merged['plan-phase']).toEqual(defaultTaskValidation['plan-phase'])
  })

  it('adds a new entry not in defaults', () => {
    const custom = { type: 'minLength' as const, value: 100, maxRetries: 1 }
    const merged = mergeTaskValidation({ 'custom-task': custom })
    expect(merged['custom-task']).toEqual(custom)
    expect(merged['gather-recon']).toEqual(
      defaultTaskValidation['gather-recon'],
    )
  })
})
