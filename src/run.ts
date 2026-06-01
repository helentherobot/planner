import type { PlanState, Task } from './types.js'
import type { Adapters } from './adapters.js'
import { handleNormalizePhasePrompt } from './tasks/normalize-phase-prompt.js'
import { handlePlanPhase } from './tasks/plan-phase.js'
import { handleNormalizePhasePlan } from './tasks/normalize-phase-plan.js'
import { handleIndexPhase } from './tasks/index-phase.js'
import { handleSplitPhase } from './tasks/split-phase.js'
import { handleCheckPhase } from './tasks/check-phase.js'
import { handleInvestigatePhase } from './tasks/investigate-phase.js'
import { handleRevisePhase } from './tasks/revise-phase.js'
import { handleCollectFeedback } from './tasks/collect-feedback.js'
import { handleReorderPhases } from './tasks/reorder-phases.js'
import { handleCleanup } from './tasks/cleanup.js'
import { handleCommitPhase } from './tasks/commit-phase.js'

type TaskHandler = (task: Task, state: PlanState, adapters: Adapters) => Promise<PlanState>

const handlers: Record<string, TaskHandler> = {
  'normalize-phase-prompt': handleNormalizePhasePrompt,
  'plan-phase': handlePlanPhase,
  'normalize-phase-plan': handleNormalizePhasePlan,
  'index-phase': handleIndexPhase,
  'split-phase': handleSplitPhase,
  'check-phase': handleCheckPhase,
  'investigate-phase': handleInvestigatePhase,
  'revise-phase': handleRevisePhase,
  'collect-feedback': handleCollectFeedback,
  'reorder-phases': handleReorderPhases,
  cleanup: handleCleanup,
  'commit-phase': handleCommitPhase,
}

export async function run(
  state: PlanState,
  adapters: Adapters,
  signal?: AbortSignal,
): Promise<PlanState> {
  let current = state

  while (current.remainingTasks.length > 0) {
    if (signal?.aborted) break

    const [task, ...rest] = current.remainingTasks
    current = { ...current, currentTask: task, remainingTasks: rest }

    const handler = handlers[task.type]
    if (!handler) {
      console.warn(`run: unknown task type "${task.type}", skipping`)
      current = { ...current, completedTasks: [...current.completedTasks, task] }
      adapters.store.write(current)
      continue
    }

    current = await handler(task, current, adapters)
    current = {
      ...current,
      completedTasks: [...current.completedTasks, task],
      currentTask: null,
    }

    adapters.store.write(current)

    const totalTasks = current.completedTasks.length + current.remainingTasks.length
    await adapters.observer.update(current.progressHandle, {
      brief: current.brief,
      completedTasks: current.completedTasks,
      totalTasks,
      currentTask: null,
      isComplete: current.remainingTasks.length === 0,
    })
  }

  return current
}
