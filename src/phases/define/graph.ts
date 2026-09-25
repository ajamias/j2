/**
 * Define phase subgraph.
 *
 * interview-me -> idea-refine -> (new project / refactor?) -> context/constraints -> spec.
 * H/A clarify loops (interview-me, idea-refine, spec) route through human-clarify and back.
 * Entry: interview-me. Exits (ENDs) once the spec is done.
 */

import { END, START, StateGraph } from "@langchain/langgraph";

import { AgentState, type AgentStateType } from "../../state.js";
import type { NodeContext } from "../../core/node.js";
import { traced } from "../../core/logging.js";

import * as classifyProject from "./classify_project.js";
import * as constraintDrivenDevelopment from "./constraint_driven_development.js";
import * as gitHistory from "./git_history.js";
import * as graphifyExplore from "./graphify_explore.js";
import * as humanClarify from "./human_clarify.js";
import * as ideaRefine from "./idea_refine.js";
import * as interviewMe from "./interview_me.js";
import * as specDrivenDevelopment from "./spec_driven_development.js";

const clarify = (nextNode: string) => (state: AgentStateType): string =>
  state.need_clarify ? "human-clarify" : nextNode;

const afterHumanClarify = (state: AgentStateType): string =>
  state.clarify_return ?? "spec-driven-development";

const project = (state: AgentStateType): string | string[] =>
  state.is_new_or_refactor
    ? "constraint-driven-development"
    : ["git-history", "graphify-explore"]; // parallel context gathering

export function build(ctx: NodeContext) {
  const g = new StateGraph(AgentState)
    .addNode("interview-me", traced(interviewMe.NAME, interviewMe.build(ctx)))
    .addNode("idea-refine", traced(ideaRefine.NAME, ideaRefine.build(ctx)))
    .addNode("classify-project", traced(classifyProject.NAME, classifyProject.build(ctx)))
    .addNode("git-history", traced(gitHistory.NAME, gitHistory.build(ctx)))
    .addNode("graphify-explore", traced(graphifyExplore.NAME, graphifyExplore.build(ctx)))
    .addNode("constraint-driven-development", traced(constraintDrivenDevelopment.NAME, constraintDrivenDevelopment.build(ctx)))
    .addNode("spec-driven-development", traced(specDrivenDevelopment.NAME, specDrivenDevelopment.build(ctx)))
    .addNode("human-clarify", traced(humanClarify.NAME, humanClarify.build(ctx)));

  g.addEdge(START, "interview-me");
  g.addConditionalEdges("interview-me", clarify("idea-refine"), {
    "human-clarify": "human-clarify",
    "idea-refine": "idea-refine",
  });
  // idea-refine is non-interactive: it consumes the confirmed intent and advances.
  g.addEdge("idea-refine", "classify-project");
  g.addConditionalEdges("human-clarify", afterHumanClarify, {
    "interview-me": "interview-me",
    "spec-driven-development": "spec-driven-development",
  });
  g.addConditionalEdges("classify-project", project, {
    "constraint-driven-development": "constraint-driven-development",
    "git-history": "git-history",
    "graphify-explore": "graphify-explore",
  });
  g.addEdge("constraint-driven-development", "spec-driven-development");
  g.addEdge("git-history", "spec-driven-development");
  g.addEdge("graphify-explore", "spec-driven-development");
  g.addConditionalEdges("spec-driven-development", clarify(END), {
    "human-clarify": "human-clarify",
    [END]: END,
  });

  return g.compile();
}
