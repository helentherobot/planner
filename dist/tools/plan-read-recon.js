import { makeDiscoverable } from './helpers.js';
export function makePlanReadRecon(store) {
    return makeDiscoverable('__plan_read_recon', 'Read the current reconnaissance notes.', { type: 'object', properties: {}, required: [] }, async () => {
        const current = store.read();
        return current?.recon ?? '';
    });
}
