import type { Recipe } from '@helentherobot/runner'

export const synthesizePhases: Recipe<[{ brief: string }]> = {
  profile: 'sonnet',
  prompt: ({
    brief,
  }) => `You are a senior software architect. Given the following project brief, produce an ordered list of implementation phases.

Brief:
${brief}

Return a numbered list of phase titles only — one per line, no descriptions. Each phase title should be concise and specific (e.g. "Database schema and migrations", "Authentication middleware").`,
}
