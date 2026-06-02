import type { PlanState, Task } from '@/types.js'
import type { Adapters } from '@/types.js'
import { handleGatherRecon } from '@/tasks/gather-recon.js'
import { handleSynthesizePhases } from '@/tasks/synthesize-phases.js'
import { handleNormalizePhasePrompt } from '@/tasks/normalize-phase-prompt.js'
import { handlePlanPhase } from '@/tasks/plan-phase.js'
import { handleNormalizePhasePlan } from '@/tasks/normalize-phase-plan.js'
import { handleIndexPhase } from '@/tasks/index-phase.js'
import { handleSplitPhase } from '@/tasks/split-phase.js'
import { handleCheckPhase } from '@/tasks/check-phase.js'
import { handleInvestigatePhase } from '@/tasks/investigate-phase.js'
import { handleRevisePhase } from '@/tasks/revise-phase.js'
import { handleCollectFeedback } from '@/tasks/collect-feedback.js'
import { handleCleanup } from '@/tasks/cleanup.js'
import { handleCommitPhase } from '@/tasks/commit-phase.js'

type TaskHandler = (task: Task, state: PlanState, adapters: Adapters) => Promise<PlanState>

const handlers: Record<string, TaskHandler> = {
  'gather-recon': handleGatherRecon,
  'synthesize-phases': handleSynthesizePhases,
  'normalize-phase-prompt': handleNormalizePhasePrompt,
  'plan-phase': handlePlanPhase,
  'normalize-phase-plan': handleNormalizePhasePlan,
  'index-phase': handleIndexPhase,
  'split-phase': handleSplitPhase,
  'check-phase': handleCheckPhase,
  'investigate-phase': handleInvestigatePhase,
  'revise-phase': handleRevisePhase,
  'collect-feedback': handleCollectFeedback,
  cleanup: handleCleanup,
  'commit-phase': handleCommitPhase,
}

export async function run(
  state: PlanState,
  adapters: Adapters,
  signal?: AbortSignal,
): Promise<PlanState> {
  let current = state

  const totalTasks = current.completedTasks.length + current.remainingTasks.length
  const progressHandle = await adapters.observer.start({
    brief: current.brief,
    completedTasks: current.completedTasks,
    totalTasks,
    currentTask: null,
    isComplete: false,
  })
  current = { ...current, progressHandle }

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

    const runningTotal = current.completedTasks.length + current.remainingTasks.length
    await adapters.observer.update(current.progressHandle, {
      brief: current.brief,
      completedTasks: current.completedTasks,
      totalTasks: runningTotal,
      currentTask: null,
      isComplete: current.remainingTasks.length === 0,
    })
  }

  await adapters.observer.complete(current.progressHandle, {
    brief: current.brief,
    completedTasks: current.completedTasks,
    totalTasks: current.completedTasks.length,
    currentTask: null,
    isComplete: true,
  })

  return current
}
