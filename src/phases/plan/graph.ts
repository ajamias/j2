/** Plan phase subgraph. Entry: planning-and-task-breakdown; then ENDs. */

import { END, START, StateGraph } from "@langchain/langgraph";

import { AgentState } from "../../state.js";
import type { NodeContext } from "../../core/node.js";
import { traced } from "../../core/logging.js";

import * as planningAndTaskBreakdown from "./planning_and_task_breakdown.js";

export function build(ctx: NodeContext) {
  const g = new StateGraph(AgentState).addNode(
    "planning-and-task-breakdown",
    traced(planningAndTaskBreakdown.NAME, planningAndTaskBreakdown.build(ctx)),
  );
  g.addEdge(START, "planning-and-task-breakdown");
  g.addEdge("planning-and-task-breakdown", END);
  return g.compile();
}
