/**
 * Control node: human-clarify (define phase H/A loop).
 *
 * Interrupts for a human answer to the pending clarify question and adds it to context.
 * Shared by interview-me, idea-refine, and spec-driven-development.
 */

import { interrupt } from "@langchain/langgraph";
import type { NodeContext, NodeFn } from "../../core/node.js";

export const NAME = "human-clarify";

export function build(_ctx: NodeContext): NodeFn {
  return (state) => {
    const question = state.clarify_question ?? "(no question)";
    const answer = interrupt<{ question: string; skill: string }, string>({
      question,
      skill: state.clarify_return ?? "",
    });
    return {
      clarifications: [`Q: ${question} A: ${answer}`],
      need_clarify: false,
      log: [`[human-clarify] ${question} -> ${answer}`],
    };
  };
}
