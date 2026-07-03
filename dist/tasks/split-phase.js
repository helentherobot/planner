import { resolveProfile, runRecipe, phaseTaskOrder } from '../helpers.js';
import { prompt } from '../prompts/split-phase/recipe.js';
export async function handleSplitPhase(task, state, adapters) {
    const phase = task.phase;
    const phaseState = state.phases[phase];
    const maxFiles = adapters.config.maxFilesPerPhase;
    const fileCount = (phaseState.index ?? '')
        .split('\n')
        .filter((l) => l.trim()).length;
    if (fileCount <= maxFiles) {
        return state;
    }
    const result = await runRecipe(adapters.tools.runner, await resolveProfile(adapters, task.type), { profile: '', prompt }, [{ phase, phaseState, maxFiles }], { onUsage: adapters.onUsage, taskType: task.type });
    let subPhases;
    try {
        const text = result.text
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/, '');
        subPhases = JSON.parse(text);
    }
    catch {
        console.warn('split-phase: failed to parse split result, skipping split');
        return state;
    }
    if (!Array.isArray(subPhases) || subPhases.length < 2) {
        return state;
    }
    const newPhaseStates = subPhases.map((sp) => ({
        title: sp.title,
        brief: sp.brief,
        controls: {},
        iterations: 0,
    }));
    const newTasks = [];
    for (let i = 0; i < newPhaseStates.length; i++) {
        const newIndex = phase + i;
        for (const type of phaseTaskOrder) {
            newTasks.push({ type, phase: newIndex });
        }
    }
    const updatedPhases = [
        ...state.phases.slice(0, phase),
        ...newPhaseStates,
        ...state.phases.slice(phase + 1),
    ];
    const phaseTaskSet = new Set(phaseTaskOrder);
    const filteredRemaining = state.remainingTasks.filter((t) => !(t.phase === phase && phaseTaskSet.has(t.type)));
    const updatedRemaining = [...newTasks, ...filteredRemaining];
    const nextState = {
        ...state,
        phases: updatedPhases,
        remainingTasks: updatedRemaining,
    };
    adapters.store.write(nextState);
    return nextState;
}
