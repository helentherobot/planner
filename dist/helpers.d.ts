import type { Recipe, Runner, DiscoverableTool } from '@helentherobot/runner';
import type { Store, PlanState, PhaseState, ControlState, Task, Adapters } from './types.js';
type UsageCtx = {
    onUsage: Adapters['onUsage'];
    taskType: string;
    controlName?: string;
};
export declare function resolveProfile(adapters: {
    tools: {
        profile: string;
    };
    config: {
        taskProfiles?: Record<string, string | (() => string | Promise<string>)>;
    };
}, taskType: string, recipeProfile?: string): Promise<string>;
export declare function resolveTools(adapters: {
    tools: {
        tools: DiscoverableTool[];
        taskTools?: Record<string, DiscoverableTool[]>;
    };
}, taskType: string): DiscoverableTool[];
export declare function runRecipe<TArgs extends unknown[]>(runner: Runner, profile: string, recipe: Recipe<TArgs>, args: TArgs, usageCtx?: UsageCtx): Promise<import("@helentherobot/runner").RunResult>;
export declare const phaseTaskOrder: string[];
export declare function expandPhases(phases: string[]): Task[];
export declare function readClaimedFiles(phases: PhaseState[], currentPhase: number): string[];
export declare function createInitialState(brief: string): PlanState;
export declare function updatePhase(store: Store, index: number, update: Partial<PhaseState>): void;
export declare function updateControl(store: Store, phaseIndex: number, name: string, update: Partial<ControlState>): void;
export {};
//# sourceMappingURL=helpers.d.ts.map