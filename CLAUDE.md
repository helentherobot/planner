# Helen Planner — Project Notes

## Code Style

- No useless comments. Only add comments that explain tricky or non-obvious code.
- Run `npm run format` and `npm test` before every commit.
- No auto-committing. Only commit when explicitly asked.
- Phase commits must start with "Phase N: ..." when committing a single implementation phase.

## Prompt Files (`src/prompts/`)

- **Line length: 80 characters maximum in source.** Prettier handles code lines
  (printWidth: 80), but does not reflow string contents — prose inside template
  literals and quoted strings must be wrapped manually.
- Use template literals for all prompt strings. Wrap prose at 80 chars with actual
  line breaks — LLMs treat source line breaks as whitespace, so this does not
  change the model's input.
- Prompt bodies must not contain markdown syntax: no `##` headings, no `**bold**`,
  no `*italic*`, no backtick fences. Bullet lists with `-` are plain text and are fine.
- Every prompt that requests free-form text output must explicitly instruct the
  model to respond in plaintext (no headings, no bullet points, no bold, no italic,
  no code fences).
- Free-text fields inside JSON response schemas must be annotated inline as
  "plain prose, no markdown".
