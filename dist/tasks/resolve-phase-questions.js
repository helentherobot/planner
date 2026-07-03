import { send } from '@helentherobot/runner';
import { resolveTools, resolveProfile } from '../helpers.js';
import { systemPrompt, userMessage, } from '../prompts/resolve-phase-questions/index.js';
export async function handleResolvePhaseQuestions(task, state, adapters) {
    const phaseQuestions = state.pendingQuestions.filter((q) => Array.isArray(q.phaseIndex)
        ? q.phaseIndex.includes(task.phase)
        : q.phaseIndex === task.phase);
    if (phaseQuestions.length === 0) {
        return state;
    }
    const phase = state.phases[task.phase];
    const tools = resolveTools(adapters, task.type);
    const profile = await resolveProfile(adapters, task.type);
    let current = state;
    for (const question of phaseQuestions) {
        const otherPhases = current.phases
            .map((p, i) => ({ index: i, title: p.title, fileIndex: p.index ?? '' }))
            .filter((p) => p.index !== task.phase);
        const userMsg = userMessage({
            phaseIndex: task.phase,
            phaseTitle: phase.title,
            phaseBrief: phase.brief,
            brief: current.brief,
            recon: current.recon,
            question,
            answeredQuestions: current.answeredQuestions,
            otherPhases,
        });
        const result = await send(adapters.tools.runner, { profile, systemPrompt, tools, maxSteps: 20 }, [userMsg]);
        adapters.onUsage?.({
            taskType: task.type,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            totalCostUsd: result.usage.totalCostUsd,
        });
        const lastMessage = result.messages.at(-1);
        const raw = lastMessage?.role === 'assistant'
            ? Array.isArray(lastMessage.content)
                ? lastMessage.content
                    .filter((p) => p.type === 'text')
                    .map((p) => ('text' in p ? p.text : ''))
                    .join('')
                : String(lastMessage.content)
            : '';
        const stripped = raw
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/, '');
        let parsed;
        try {
            parsed = JSON.parse(stripped);
        }
        catch {
            console.warn(`resolve-phase-questions: malformed JSON for question ${question.id}, skipping`);
            continue;
        }
        if (parsed.result === 'answered' && parsed.answer !== undefined) {
            current = {
                ...current,
                pendingQuestions: current.pendingQuestions.filter((q) => q.id !== question.id),
                answeredQuestions: [
                    ...current.answeredQuestions,
                    { ...question, answer: parsed.answer },
                ],
            };
        }
        else if (parsed.result === 'enriched' && parsed.context !== undefined) {
            current = {
                ...current,
                pendingQuestions: current.pendingQuestions.map((q) => q.id === question.id ? { ...q, context: parsed.context } : q),
            };
        }
    }
    return current;
}
