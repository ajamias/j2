/**
 * Control node: classify-project (define phase diamond).
 *
 * Decides "new project / architecture refactor?"; sets state.is_new_or_refactor.
 * Self-contained: edit the system prompt or parsing here.
 */

import type { NodeContext, NodeFn } from "../../core/node.js";

export const NAME = "classify-project";

const SYSTEM = `You classify a software task. Is it a NEW PROJECT or an ARCHITECTURE REFACTOR
(as opposed to an incremental change to existing code)?

Reply with ONLY a JSON object, no prose, no code fences:
{"new_or_refactor": true|false, "reason": "<one short sentence>"}`;

export function build(ctx: NodeContext): NodeFn {
  return async (state) => {
    // Reads: task + intent.
    const intent = state.intent ?? "(none)";
    const message =
      `TASK:\n${state.task ?? ""}\n\n` +
      `CONFIRMED INTENT:\n${intent}\n\n` +
      "Is this a new project or an architecture refactor?";
    let flag = false;
    let reason = "";
    try {
      const decision = await ctx.provider.runJson(message, { system: SYSTEM, model: ctx.model });
      flag = Boolean(decision.new_or_refactor);
      reason = typeof decision.reason === "string" ? decision.reason : "";
    } catch (e) {
      flag = false;
      reason = `classify error: ${e instanceof Error ? e.message : String(e)}`;
    }
    return {
      is_new_or_refactor: flag,
      log: [`[classify-project] new_or_refactor=${flag} (${reason})`],
    };
  };
}
