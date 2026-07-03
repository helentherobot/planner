import { makeDiscoverable } from './helpers.js';
import { updatePhase } from '../helpers.js';
export function makePlanWritePhase(store, phase) {
    return makeDiscoverable('__plan_write_phase', 'Write the implementation plan for this phase.', {
        type: 'object',
        properties: {
            content: {
                type: 'string',
                description: 'The implementation plan content',
            },
        },
        required: ['content'],
    }, async ({ content }) => {
        updatePhase(store, phase, { brief: content });
        return 'Plan written.';
    });
}
