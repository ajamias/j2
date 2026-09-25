/**
 * Review phase subgraph.
 *
 * git-workflow-and-versioning -> code-review-and-quality -> (LGTM?) -> HUMAN review.
 * Entry: git-workflow-and-versioning. Sets state.lgtm / state.human_approved before
 * it ENDs (routed on by the top-level graph: approved -> DONE, else -> router).
 */

import { END, START, StateGraph } from "@langchain/langgraph";

import { AgentState, type AgentStateType } from "../../state.js";
import type { NodeContext } from "../../core/node.js";
import { traced } from "../../core/logging.js";

import * as codeReviewAndQuality from "./code_review_and_quality.js";
import * as gitWorkflowAndVersioning from "./git_workflow_and_versioning.js";
import * as humanReview from "./human_review.js";

const lgtm = (state: AgentStateType): string =>
  state.lgtm ? "human-review" : END;

export function build(ctx: NodeContext) {
  const g = new StateGraph(AgentState)
    .addNode("git-workflow-and-versioning", traced(gitWorkflowAndVersioning.NAME, gitWorkflowAndVersioning.build(ctx)))
    .addNode("code-review-and-quality", traced(codeReviewAndQuality.NAME, codeReviewAndQuality.build(ctx)))
    .addNode("human-review", traced(humanReview.NAME, humanReview.build(ctx)));

  g.addEdge(START, "git-workflow-and-versioning");
  g.addEdge("git-workflow-and-versioning", "code-review-and-quality");
  g.addConditionalEdges("code-review-and-quality", lgtm, {
    "human-review": "human-review",
    [END]: END,
  });
  g.addEdge("human-review", END);
  return g.compile();
}
