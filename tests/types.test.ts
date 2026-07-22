import { describe, it } from 'vitest'
import type {
  Config,
  ControlState,
  PhaseState,
  Task,
  PlanState,
  Question,
  PhaseQuestion,
  AnsweredQuestion,
  Answer,
} from '../src/index.js'

describe('types', () => {
  it('Config is exported and assignable', () => {
    const config: Config = {
      maxFilesPerPhase: 10,
      minIterations: 1,
      maxIterations: 5,
    }
    void config
  })

  it('ControlState is exported and assignable', () => {
    const controlState: ControlState = {
      dismissed: [],
      raised: [],
    }
    void controlState
  })

  it('PhaseState is exported and assignable', () => {
    const phaseState: PhaseState = {
      title: 'Phase one',
      brief: 'Do the thing',
      controls: {},
      iterations: 0,
    }
    void phaseState
  })

  it('Task is exported and assignable', () => {
    const task: Task = {
      type: 'synthesize-phases',
    }
    void task
  })

  it('PlanState is exported and assignable', () => {
    const planState: PlanState = {
      brief: 'Build a thing',
      recon: '',
      startedAt: Date.now(),
      completedAt: null,
      currentTask: null,
      progressHandle: null,
      phases: [],
      remainingTasks: [],
      completedTasks: [],
      awaitingQuestions: [],
      answeredQuestions: [],
      pendingQuestions: [],
    }
    void planState
  })

  it('Question is exported and assignable', () => {
    const question: Question = {
      id: 'recon-0',
      question: 'What is the deployment target?',
      context: 'This affects whether we need containerisation phases.',
    }
    void question
  })

  it('PhaseQuestion is exported and assignable', () => {
    const phaseQuestion: PhaseQuestion = {
      id: '0-0',
      question: 'Should we use a monorepo?',
      phaseIndex: 0,
    }
    void phaseQuestion
  })

  it('AnsweredQuestion is exported and assignable', () => {
    const answeredQuestion: AnsweredQuestion = {
      id: 'recon-0',
      question: 'What is the deployment target?',
      answer: 'AWS Lambda',
      phaseIndex: [1, 2],
    }
    void answeredQuestion
  })

  it('Answer is exported and assignable', () => {
    const answer: Answer = {
      questionId: 'recon-0',
      answer: 'AWS Lambda',
    }
    void answer
  })
})
