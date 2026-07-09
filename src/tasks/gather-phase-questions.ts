import type { Task, PlanState, PhaseQuestion } from '../types.js'
import type { Adapters } from '../types.js'
import { resolveProfile, runRecipe } from '../helpers.js'
import { prompt } from '../prompts/gather-phase-questions/recipe.js'

export async function handleGatherPhaseQuestions(
  task: Task,
  state: PlanState,
  adapters: Adapters,
): Promise<PlanState> {
  const phaseIndex = task.phase!
  const phaseState = state.phases[phaseIndex]

  const result = await runRecipe(
    adapters.tools.runner,
    await resolveProfile(adapters, task.type),
    { profile: '', prompt },
    [
      {
        phaseIndex,
        phaseState,
        answeredQuestions: state.answeredQuestions,
        existingPendingQuestions: state.pendingQuestions,
      },
    ],
    { onUsage: adapters.onUsage, taskType: task.type },
  )

  let parsed: { questions: Array<{ question: string; context?: string }> }
  try {
    const text = result.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
    parsed = JSON.parse(text)
  } catch {
    return state
  }

  const questions = parsed.questions ?? []

  if (questions.length === 0) {
    return state
  }

  const updatedPending = [...state.pendingQuestions]

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const normalised = q.question.trim().toLowerCase()

    const existingIndex = updatedPending.findIndex(
      (p) => p.question.trim().toLowerCase() === normalised,
    )

    if (existingIndex !== -1) {
      const existing = updatedPending[existingIndex]
      const existingPhases = Array.isArray(existing.phaseIndex)
        ? existing.phaseIndex
        : [existing.phaseIndex]
      if (!existingPhases.includes(phaseIndex)) {
        updatedPending[existingIndex] = {
          ...existing,
          phaseIndex: [...existingPhases, phaseIndex],
        }
      }
    } else {
      const id = `${phaseIndex}-${state.pendingQuestions.length + i}`
      const newQuestion: PhaseQuestion = {
        id,
        question: q.question,
        phaseIndex,
        ...(q.context !== undefined ? { context: q.context } : {}),
      }
      updatedPending.push(newQuestion)
    }
  }

  return { ...state, pendingQuestions: updatedPending }
}
