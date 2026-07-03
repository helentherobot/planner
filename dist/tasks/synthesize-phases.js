import { resolveProfile, runRecipe, expandPhases } from '../helpers.js';
import { prompt } from '../prompts/synthesize-phases/recipe.js';
export async function handleSynthesizePhases(task, state, adapters) {
    const result = await runRecipe(adapters.tools.runner, await resolveProfile(adapters, task.type), { profile: '', prompt }, [
        {
            brief: state.brief,
            recon: state.recon,
            answeredQuestions: state.answeredQuestions,
        },
    ], { onUsage: adapters.onUsage, taskType: task.type });
    const titles = result.text
        .split('\n')
        .map((line) => line.replace(/^\d+\.\s*/, '').trim())
        .filter(Boolean);
    const phases = titles.map((title) => ({
        title,
        brief: '',
        controls: {},
        iterations: 0,
    }));
    const phaseTasks = expandPhases(titles);
    return {
        ...state,
        phases,
        remainingTasks: [...phaseTasks, ...state.remainingTasks],
    };
}
