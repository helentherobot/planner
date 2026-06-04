import type { PlanState, PhaseQuestion, Adapters } from './types.js'
import { resolveProfile, runRecipe, phaseTaskOrder } from './helpers.js'
import { prompt } from './prompts/revise-determine-phases/recipe.js'
import { drainTasks } from './run.js'

export async function revise(
  state: PlanState,
  adapters: Adapters,
  question: PhaseQuestion,
  answer: string,
  options?: { signal?: AbortSignal },
): Promise<PlanState> {
  const result = await runRecipe(
    adapters.tools.runner,
    await resolveProfile(adapters, 'revise-spread'),
    { profile: '', prompt },
    [
      {
        question,
        answer,
        directPhaseIndex: question.phaseIndex,
        phaseTitles: state.phases.map((p, i) => ({ index: i, title: p.title })),
      },
    ],
    { onUsage: adapters.onUsage, taskType: 'revise-spread' },
  )

  let parsed: { additionalPhases: number[] }
  try {
    const text = result.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
    parsed = JSON.parse(text)
  } catch {
    parsed = { additionalPhases: [] }
  }

  const directPhases = Array.isArray(question.phaseIndex)
    ? question.phaseIndex
    : [question.phaseIndex]
  const additionalPhases: number[] = parsed.additionalPhases ?? []

  const allAffected = [...new Set([...directPhases, ...additionalPhases])].sort(
    (a, b) => a - b,
  )

  const alreadyQueued = new Set(
    state.remainingTasks
      .filter((t) => t.phase !== undefined)
      .map((t) => t.phase),
  )

  const newTasks = allAffected
    .filter((phaseIndex) => !alreadyQueued.has(phaseIndex))
    .flatMap((phaseIndex) =>
      phaseTaskOrder.map((type) => ({ type, phase: phaseIndex })),
    )

  const updatedPending = state.pendingQuestions.filter(
    (q) => q.id !== question.id,
  )
  const answeredQuestion = { ...question, answer }

  let current: PlanState = {
    ...state,
    remainingTasks: [...newTasks, ...state.remainingTasks],
    pendingQuestions: updatedPending,
    answeredQuestions: [...state.answeredQuestions, answeredQuestion],
  }

  adapters.store.write(current)

  const drainResult = await drainTasks(current, adapters, {
    signal: options?.signal,
  })

  if (drainResult.status === 'needs-answers') {
    throw new Error(
      'revise: unexpected needs-answers state — gather-questions should not run during revise',
    )
  }

  return drainResult.state
}
