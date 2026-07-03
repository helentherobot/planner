import type { PlanState, RunResult, RunOptions } from './types.js';
import type { Adapters } from './types.js';
export declare function drainTasks(initial: PlanState, adapters: Adapters, options?: RunOptions): Promise<RunResult>;
export declare function run(state: PlanState, adapters: Adapters, options?: RunOptions | AbortSignal): Promise<RunResult>;
//# sourceMappingURL=run.d.ts.map