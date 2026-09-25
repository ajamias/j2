/**
 * Verify phase subgraph.
 *
 * test-driven-development -> code-simplification -> (ci-cd + docs in parallel) -> END.
 * Entry: test-driven-development.
 */

import { END, START, StateGraph } from "@langchain/langgraph";

import { AgentState } from "../../state.js";
import type { NodeContext } from "../../core/node.js";
import { traced } from "../../core/logging.js";

import * as ciCdAndAutomation from "./ci_cd_and_automation.js";
import * as codeSimplification from "./code_simplification.js";
import * as documentationAndAdrs from "./documentation_and_adrs.js";
import * as testDrivenDevelopment from "./test_driven_development.js";

export function build(ctx: NodeContext) {
  const g = new StateGraph(AgentState)
    .addNode("test-driven-development", traced(testDrivenDevelopment.NAME, testDrivenDevelopment.build(ctx)))
    .addNode("code-simplification", traced(codeSimplification.NAME, codeSimplification.build(ctx)))
    .addNode("ci-cd-and-automation", traced(ciCdAndAutomation.NAME, ciCdAndAutomation.build(ctx)))
    .addNode("documentation-and-adrs", traced(documentationAndAdrs.NAME, documentationAndAdrs.build(ctx)));

  g.addEdge(START, "test-driven-development");
  g.addEdge("test-driven-development", "code-simplification");
  g.addEdge("code-simplification", "ci-cd-and-automation"); // parallel fan-out
  g.addEdge("code-simplification", "documentation-and-adrs");
  g.addEdge("ci-cd-and-automation", END);
  g.addEdge("documentation-and-adrs", END);
  return g.compile();
}
