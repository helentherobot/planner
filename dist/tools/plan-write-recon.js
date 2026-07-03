import { makeDiscoverable } from './helpers.js';
export function makePlanWriteRecon(store, fallbackState) {
    return makeDiscoverable('__plan_write_recon', 'Write reconnaissance notes about the project.', {
        type: 'object',
        properties: {
            content: { type: 'string', description: 'The recon content' },
        },
        required: ['content'],
    }, async ({ content }) => {
        const current = store.read() ?? fallbackState;
        store.write({ ...current, recon: content });
        return 'Recon written.';
    });
}
