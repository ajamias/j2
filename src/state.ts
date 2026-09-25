/**
 * Shared cross-phase state, defined with Zod (LangGraph's recommended approach).
 *
 * A single schema shared by the top-level graph and every phase subgraph (they share
 * these channels, so no input/output mapping is needed at subgraph boundaries).
 * Accumulator channels use `withLangGraph` to attach an append reducer + default.
 */

import { z } from "zod";
import { withLangGraph } from "@langchain/langgraph/zod";

/** An append-reducer array channel that defaults to `[]`. */
function appended<T extends z.ZodTypeAny>(item: T) {
  return withLangGraph(z.array(item), {
    reducer: { fn: (a: z.infer<T>[], b: z.infer<T>[]) => a.concat(b) },
    default: () => [],
  });
}

export const HistoryItem = z.object({
  skill: z.string(),
  summary: z.string(),
});
export type HistoryItem = z.infer<typeof HistoryItem>;

export const AgentState = z.object({
  // --- inputs ---
  task: z.string().optional(), // the user's request
  workdir: z.string().optional(), // cwd for skill tool calls

  // --- accumulators (reducers merge across parallel branches) ---
  context: appended(z.string()), // general gathered context (build/verify/review phases)
  history: appended(HistoryItem), // completed steps
  log: appended(z.string()), // human-readable trace
  steps: z.number().optional(), // loop counter (informational)

  // --- define phase: typed context channels (each node reads only what it needs) ---
  intent: z.string().optional(), // interview-me sets it; idea-refine refines it
  clarifications: appended(z.string()), // human-clarify Q/A pairs
  repoContext: appended(z.string()), // git-history + graphify-explore summaries
  constraints: z.string().optional(), // constraint-driven-development
  spec: z.string().optional(), // spec-driven-development (define phase output)

  // --- router ---
  entry_phase: z.string().optional(), // define | plan | build | verify | review

  // --- decision flags (set inside subgraphs, routed on at the top level) ---
  is_new_or_refactor: z.boolean().optional(), // define: idea-refine diamond
  specialized: z.array(z.string()).optional(), // build: source-driven-development picks
  confident: z.boolean().optional(), // build: doubt-driven-development gate
  lgtm: z.boolean().optional(), // review: code-review-and-quality gate
  human_approved: z.boolean().optional(), // review: HUMAN review gate

  // --- H/A clarify loop (define phase) ---
  need_clarify: z.boolean().optional(), // a skill asked the human a question
  clarify_question: z.string().optional(), // the pending question
  clarify_return: z.string().optional(), // node to resume after human answers
});

export type AgentStateType = z.infer<typeof AgentState>;
export type NodeUpdate = Partial<AgentStateType>;
