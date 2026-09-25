/**
 * Control node: git-history (define phase, context++).
 *
 * Gathers context from the repo's git history. Read-only tools. Self-contained.
 */

import { extractSummary } from "../../core/parse.js";
import type { NodeContext, NodeFn } from "../../core/node.js";

export const NAME = "git-history";

export function build(ctx: NodeContext): NodeFn {
  return async (state) => {
    const res = await ctx.provider.run(
      "Summarize this repository's recent git history and structure to build " +
        `context for the task: ${state.task ?? ""}. ` +
        "End with 'SUMMARY: <key facts>'.",
      {
        cwd: state.workdir ?? "",
        permissionMode: "default",
        allowedTools: ["Bash", "Read", "Grep", "Glob"],
        model: ctx.model,
      },
    );
    const summary = extractSummary(res.text);
    return {
      repoContext: [`git-history: ${summary}`],
      log: [`[git-history] ${summary}`],
    };
  };
}
