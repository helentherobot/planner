import type { PlanState, PhaseQuestion, Adapters } from './types.js';
export declare function revise(state: PlanState, adapters: Adapters, question: PhaseQuestion, answer: string, options?: {
    signal?: AbortSignal;
}): Promise<PlanState>;
//# sourceMappingURL=revise.d.ts.map