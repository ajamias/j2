/**
 * Control node: graphify-explore (define phase, context++).
 *
 * Explores the codebase to build architectural context. Read-only tools. Self-contained.
 */

import { extractSummary } from "../../core/parse.js";
import type { NodeContext, NodeFn } from "../../core/node.js";

export const NAME = "graphify-explore";

export function build(ctx: NodeContext): NodeFn {
  return async (state) => {
    const res = await ctx.provider.run(
      "Explore this codebase and summarize its architecture and file " +
        `relationships to build context for the task: ${state.task ?? ""}. ` +
        "End with 'SUMMARY: <key facts>'.",
      {
        cwd: state.workdir ?? "",
        permissionMode: "default",
        allowedTools: ["Read", "Grep", "Glob", "Bash"],
        model: ctx.model,
      },
    );
    const summary = extractSummary(res.text);
    return {
      repoContext: [`graphify-explore: ${summary}`],
      log: [`[graphify-explore] ${summary}`],
    };
  };
}
