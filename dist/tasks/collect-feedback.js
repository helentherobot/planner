import { updatePhase } from '../helpers.js';
export async function handleCollectFeedback(task, state, adapters) {
    const phase = task.phase;
    const phaseState = state.phases[phase];
    const anyRaised = adapters.controls.some((c) => (phaseState.controls[c.name]?.raised?.length ?? 0) > 0);
    const phasePipelineTasks = new Set([
        'check-phase',
        'investigate-phase',
        'revise-phase',
        'collect-feedback',
    ]);
    const withoutStalePhaseTasks = (remaining) => remaining.filter((t) => !(t.phase === phase && phasePipelineTasks.has(t.type)));
    const nextIterations = phaseState.iterations + 1;
    updatePhase(adapters.store, phase, { iterations: nextIterations });
    const updated = adapters.store.read();
    if (!anyRaised && nextIterations >= adapters.config.minimumIterations) {
        return {
            ...updated,
            remainingTasks: withoutStalePhaseTasks(state.remainingTasks),
        };
    }
    if (nextIterations >= adapters.config.maximumIterations) {
        return {
            ...updated,
            remainingTasks: withoutStalePhaseTasks(state.remainingTasks),
        };
    }
    const checkAlreadyQueued = state.remainingTasks.some((t) => t.type === 'check-phase' && t.phase === phase);
    const collectAlreadyQueued = state.remainingTasks.some((t) => t.type === 'collect-feedback' && t.phase === phase);
    if (anyRaised) {
        const reviseAlreadyQueued = state.remainingTasks.some((t) => t.type === 'revise-phase' && t.phase === phase);
        const tasks = [
            ...(!reviseAlreadyQueued
                ? [{ type: 'revise-phase', phase }]
                : []),
            ...(!checkAlreadyQueued ? [{ type: 'check-phase', phase }] : []),
            ...(!collectAlreadyQueued
                ? [{ type: 'collect-feedback', phase }]
                : []),
        ];
        return { ...updated, remainingTasks: [...tasks, ...state.remainingTasks] };
    }
    const nextTasks = [
        ...(!checkAlreadyQueued ? [{ type: 'check-phase', phase }] : []),
        ...(!collectAlreadyQueued
            ? [{ type: 'collect-feedback', phase }]
            : []),
    ];
    if (nextTasks.length === 0)
        return { ...updated, remainingTasks: state.remainingTasks };
    return { ...updated, remainingTasks: [...nextTasks, ...state.remainingTasks] };
}
