import type { Recipe } from '@helentherobot/runner'

export const gatherRecon: Recipe<[{ brief: string }]> = {
  profile: '',
  prompt: ({ brief }) => `You are preparing to plan a software implementation.

Brief:
${brief}

Use available tools to explore the project codebase: read key files, understand the tech stack, existing structure, conventions, and any constraints relevant to the brief.

Respond with a concise summary — a few paragraphs covering what exists, how it is structured, and anything a planner must know before breaking the work into phases.`,
}
