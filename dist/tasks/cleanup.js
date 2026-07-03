export async function handleCleanup(_task, state, _adapters) {
    return { ...state, completedAt: Date.now() };
}
