import type { AnsweredQuestion, PhaseQuestion, PhaseState } from '../../types.js';
export declare function prompt({ phaseIndex, phaseState, brief, recon, answeredQuestions, existingPendingQuestions, }: {
    phaseIndex: number;
    phaseState: PhaseState;
    brief: string;
    recon: string;
    answeredQuestions: AnsweredQuestion[];
    existingPendingQuestions: PhaseQuestion[];
}): string;
//# sourceMappingURL=recipe.d.ts.map