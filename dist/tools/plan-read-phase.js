import { makeDiscoverable } from './helpers.js';
export function makePlanReadPhase(store, phase) {
    return makeDiscoverable('__plan_read_phase', 'Read the current implementation plan for this phase.', { type: 'object', properties: {}, required: [] }, async () => {
        const current = store.read();
        return current?.phases[phase]?.brief ?? '';
    });
}
