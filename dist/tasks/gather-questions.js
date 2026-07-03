import { resolveProfile, runRecipe } from '../helpers.js';
import { prompt } from '../prompts/gather-questions/recipe.js';
export async function handleGatherQuestions(task, state, adapters) {
    const result = await runRecipe(adapters.tools.runner, await resolveProfile(adapters, task.type), { profile: '', prompt }, [
        {
            brief: state.brief,
            recon: state.recon,
            answeredQuestions: state.answeredQuestions,
        },
    ], { onUsage: adapters.onUsage, taskType: task.type });
    let parsed;
    try {
        const text = result.text
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/, '');
        parsed = JSON.parse(text);
    }
    catch {
        return state;
    }
    const questions = parsed.questions ?? [];
    if (questions.length === 0) {
        return state;
    }
    const awaitingQuestions = questions.map((q, i) => ({
        id: `recon-${i}`,
        question: q.question,
        ...(q.context !== undefined ? { context: q.context } : {}),
    }));
    return { ...state, awaitingQuestions };
}
