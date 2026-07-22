import { handleCollectFeedback } from '../../src/tasks/collect-feedback.ts'
import type { PlanState, PhaseState, Adapters, Task } from '../../src/index.ts'

function makePhaseState(overrides: Partial<PhaseState> = {}): PhaseState {
  return {
    title: 'Test Phase',
    brief: 'Do some things.',
    controls: {},
    iterations: 0,
    ...overrides,
  }
}

function makeState(phases: PhaseState[], remaining: Task[] = []): PlanState {
  return {
    brief: 'brief',
    recon: '',
    startedAt: Date.now(),
    completedAt: null,
    currentTask: null,
    progressHandle: null,
    phases,
    remainingTasks: remaining,
    completedTasks: [],
    awaitingQuestions: [],
    answeredQuestions: [],
    pendingQuestions: [
      { id: 'q1', phaseIndex: 0, question: 'What ORM does this project use?' },
      { id: 'q2', phaseIndex: 0, question: 'Where is authentication handled?' },
    ],
  }
}

function makeAdapters(state: PlanState): Adapters {
  let stored = state
  return {
    tools: {
      runner: {} as Adapters['tools']['runner'],
      profile: 'haiku',
      cwd: process.cwd(),
      tools: [],
    },
    store: {
      read: () => stored,
      write: (s) => {
        stored = s
      },
    },
    observer: {
      start: async () => null,
      update: async () => {},
      complete: async () => {},
    },
    config: {
      maxFilesPerPhase: 10,
      minIterations: 1,
      maxIterations: 5,
    },
    controls: [],
  }
}

const task: Task = { type: 'collect-feedback', phase: 0 }

console.log('collect-feedback-qa-sequencing')
console.log()

// Scenario 1: clean exit — Q&A tasks already in remainingTasks should survive
{
  const phase = makePhaseState({ iterations: 1 })
  const qaTask: Task = { type: 'gather-phase-questions', phase: 0 }
  const resolveTask: Task = { type: 'resolve-phase-questions', phase: 0 }
  const state = makeState([phase], [qaTask, resolveTask])
  const adapters = makeAdapters(state)

  const result = await handleCollectFeedback(task, state, adapters)

  const qasurvived = result.remainingTasks.some(
    (t) => t.type === 'gather-phase-questions' && t.phase === 0,
  )
  const resolveSurvived = result.remainingTasks.some(
    (t) => t.type === 'resolve-phase-questions' && t.phase === 0,
  )

  console.log('Scenario 1: clean exit (no issues, iterations >= minimum)')
  console.log(
    `  gather-phase-questions survived: ${qasurvived ? 'yes (correct)' : 'NO — stripped (bug)'}`,
  )
  console.log(
    `  resolve-phase-questions survived: ${resolveSurvived ? 'yes (correct)' : 'NO — stripped (bug)'}`,
  )
  console.log(
    `  remainingTasks: [${result.remainingTasks.map((t) => t.type).join(', ')}]`,
  )
  console.log()
}

// Scenario 2: issues raised — Branch 1 re-queue must not include Q&A tasks
{
  const phase = makePhaseState({
    iterations: 1,
    controls: { vagueness: { dismissed: [], raised: ['Something is vague'] } },
  })
  const state = makeState([phase])
  const adapters: Adapters = {
    ...makeAdapters(state),
    controls: [
      {
        name: 'vagueness',
        checkRecipe: { profile: 'haiku', prompt: () => '' },
        investigateRecipe: { profile: 'haiku', prompt: () => '' },
      },
    ],
  }

  const result = await handleCollectFeedback(task, state, adapters)

  const hasGather = result.remainingTasks.some(
    (t) => t.type === 'gather-phase-questions',
  )
  const hasResolve = result.remainingTasks.some(
    (t) => t.type === 'resolve-phase-questions',
  )

  console.log('Scenario 2: issues raised — Branch 1 re-queue')
  console.log(
    `  gather-phase-questions in re-queue: ${hasGather ? 'YES — re-queued (bug)' : 'no (correct)'}`,
  )
  console.log(
    `  resolve-phase-questions in re-queue: ${hasResolve ? 'YES — re-queued (bug)' : 'no (correct)'}`,
  )
  console.log(
    `  queued task types: [${result.remainingTasks.map((t) => t.type).join(', ')}]`,
  )
  console.log()
}
