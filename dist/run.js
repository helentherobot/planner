import { handleGatherRecon } from './tasks/gather-recon.js';
import { handleGatherQuestions } from './tasks/gather-questions.js';
import { handleSynthesizePhases } from './tasks/synthesize-phases.js';
import { handleNormalizePhasePrompt } from './tasks/normalize-phase-prompt.js';
import { handlePlanPhase } from './tasks/plan-phase.js';
import { handleNormalizePhasePlan } from './tasks/normalize-phase-plan.js';
import { handleIndexPhase } from './tasks/index-phase.js';
import { handleSplitPhase } from './tasks/split-phase.js';
import { handleCheckPhase } from './tasks/check-phase.js';
import { handleInvestigatePhase } from './tasks/investigate-phase.js';
import { handleRevisePhase } from './tasks/revise-phase.js';
import { handleGatherPhaseQuestions } from './tasks/gather-phase-questions.js';
import { handleResolvePhaseQuestions } from './tasks/resolve-phase-questions.js';
import { handleCollectFeedback } from './tasks/collect-feedback.js';
import { handleCleanup } from './tasks/cleanup.js';
const handlers = {
    'gather-recon': handleGatherRecon,
    'gather-questions': handleGatherQuestions,
    'gather-phase-questions': handleGatherPhaseQuestions,
    'resolve-phase-questions': handleResolvePhaseQuestions,
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
};
export async function drainTasks(initial, adapters, options) {
    const opts = options ?? {};
    let current = initial;
    if (opts.answers?.length) {
        for (const answer of opts.answers) {
            const question = current.awaitingQuestions.find((q) => q.id === answer.questionId);
            if (question) {
                current = {
                    ...current,
                    answeredQuestions: [
                        ...current.answeredQuestions,
                        { ...question, answer: answer.answer },
                    ],
                };
            }
        }
        current = { ...current, awaitingQuestions: [] };
        adapters.store.write(current);
    }
    while (current.remainingTasks.length > 0) {
        if (opts.signal?.aborted)
            break;
        const [task, ...rest] = current.remainingTasks;
        current = { ...current, currentTask: task, remainingTasks: rest };
        const handler = handlers[task.type];
        if (!handler) {
            console.warn(`run: unknown task type "${task.type}", skipping`);
            current = {
                ...current,
                completedTasks: [...current.completedTasks, task],
            };
            adapters.store.write(current);
            continue;
        }
        current = await handler(task, current, adapters);
        current = {
            ...current,
            completedTasks: [...current.completedTasks, task],
            currentTask: null,
        };
        adapters.store.write(current);
        if (current.awaitingQuestions.length > 0) {
            return {
                status: 'needs-answers',
                questions: current.awaitingQuestions,
                state: current,
            };
        }
        const runningTotal = current.completedTasks.length + current.remainingTasks.length;
        await adapters.observer.update(current.progressHandle, {
            brief: current.brief,
            completedTasks: current.completedTasks,
            totalTasks: runningTotal,
            currentTask: null,
            isComplete: current.remainingTasks.length === 0,
        });
    }
    return { status: 'complete', state: current };
}
export async function run(state, adapters, options) {
    const opts = options instanceof AbortSignal ? { signal: options } : (options ?? {});
    let current = state;
    const totalTasks = current.completedTasks.length + current.remainingTasks.length;
    const progressHandle = await adapters.observer.start({
        brief: current.brief,
        completedTasks: current.completedTasks,
        totalTasks,
        currentTask: null,
        isComplete: false,
    });
    current = { ...current, progressHandle };
    const result = await drainTasks(current, adapters, opts);
    if (result.status === 'needs-answers') {
        return result;
    }
    await adapters.observer.complete(result.state.progressHandle, {
        brief: result.state.brief,
        completedTasks: result.state.completedTasks,
        totalTasks: result.state.completedTasks.length,
        currentTask: null,
        isComplete: true,
    });
    return result;
}
