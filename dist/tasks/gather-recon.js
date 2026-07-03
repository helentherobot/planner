import { send } from '@helentherobot/runner';
import { resolveProfile, resolveTools } from '../helpers.js';
import { systemPrompt } from '../prompts/gather-recon/system.js';
export async function handleGatherRecon(task, state, adapters) {
    const result = await send(adapters.tools.runner, {
        profile: await resolveProfile(adapters, task.type),
        systemPrompt,
        tools: resolveTools(adapters, task.type),
        maxSteps: 20,
    }, [state.brief]);
    adapters.onUsage?.({
        taskType: task.type,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalCostUsd: result.usage.totalCostUsd,
    });
    const lastMessage = result.messages.at(-1);
    const recon = lastMessage?.role === 'assistant'
        ? Array.isArray(lastMessage.content)
            ? lastMessage.content
                .filter((p) => p.type === 'text')
                .map((p) => ('text' in p ? p.text : ''))
                .join('')
            : String(lastMessage.content)
        : '';
    return { ...state, recon };
}
