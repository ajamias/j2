/**
 * Control node: human-review (review phase).
 *
 * Interrupts for a human LGTM/ship decision; sets state.human_approved.
 */

import { interrupt } from "@langchain/langgraph";
import type { NodeContext, NodeFn } from "../../core/node.js";
import type { HistoryItem } from "../../state.js";

export const NAME = "human-review";

export function build(_ctx: NodeContext): NodeFn {
  return (state) => {
    const decision = interrupt<{ question: string; history: HistoryItem[] }, string>({
      question: "Approve and ship? (yes/no)",
      history: state.history ?? [],
    });
    const approved = String(decision).trim().toLowerCase().startsWith("y");
    return {
      human_approved: approved,
      log: [`[human-review] approved=${approved}`],
    };
  };
}
