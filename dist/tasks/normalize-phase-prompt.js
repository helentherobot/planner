import { resolveProfile, runRecipe, updatePhase } from '../helpers.js';
import { prompt } from '../prompts/normalize-phase-prompt/recipe.js';
export async function handleNormalizePhasePrompt(task, state, adapters) {
    const phase = task.phase;
    const phaseState = state.phases[phase];
    const result = await runRecipe(adapters.tools.runner, await resolveProfile(adapters, task.type), { profile: '', prompt }, [
        {
            phase,
            phaseState,
            recon: state.recon,
            answeredQuestions: state.answeredQuestions,
        },
    ], { onUsage: adapters.onUsage, taskType: task.type });
    updatePhase(adapters.store, phase, { prompt: result.text });
    return { ...state, phases: adapters.store.read().phases };
}
