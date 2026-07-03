import type { PhaseQuestion, AnsweredQuestion } from '../../types.js';
export declare const systemPrompt = "\n  You are a codebase research agent. Your job is to search the project\n  files to find the answer to one specific planning question. Use file\n  tools to read CLAUDE.md and README.md first, then explore source\n  files as needed. Only answer if the codebase makes it completely\n  unambiguous \u2014 inferred or likely answers do not qualify. If you find\n  relevant information but the answer is still uncertain, return it as\n  context without answering. If you find nothing relevant, return the\n  none result. Respond in plain text only. Do not use markdown \u2014 no\n  headings, no bullet points, no bold, no italic, no code fences. The\n  answer and context fields in your JSON response must be plain prose\n  sentences, not formatted text. Your final response must be a single\n  JSON object in one of these three shapes:\n  { \"result\": \"answered\", \"answer\": \"...\" }\n  { \"result\": \"enriched\", \"context\": \"...\" }\n  { \"result\": \"none\" }\n";
export interface UserMessageArgs {
    phaseIndex: number;
    phaseTitle: string;
    phaseBrief: string;
    brief: string;
    recon: string;
    question: PhaseQuestion;
    answeredQuestions: AnsweredQuestion[];
    otherPhases: Array<{
        index: number;
        title: string;
        fileIndex: string;
    }>;
}
export declare function userMessage(args: UserMessageArgs): string;
//# sourceMappingURL=index.d.ts.map