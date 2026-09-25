/**
 * Top-level graph: a router and five phase subgraphs.
 *
 *     START -> router -> {define, plan, build, verify, review} (subgraphs)
 *
 * Each phase subgraph shares the state channels, runs internally (clarify loops, fan-outs
 * stay inside), and ENDs. The top-level graph then routes on shared state flags:
 *
 *     define -> plan -> build ; build -> (confident? verify : router)
 *     verify -> review ; review -> (human_approved? DONE : router)
 *
 * The module-level `graph` is the compiled graph referenced by `langgraph.json`.
 */

import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { END, START, StateGraph, type BaseCheckpointSaver } from "@langchain/langgraph";

import { defaultContext, type NodeContext, type NodeFn } from "./core/node.js";
import { resolveProvider } from "./core/provider.js";
import { traced } from "./core/logging.js";
import { AgentState, type AgentStateType } from "./state.js";

import * as buildPhase from "./phases/build/graph.js";
import * as definePhase from "./phases/define/graph.js";
import * as planPhase from "./phases/plan/graph.js";
import * as reviewPhase from "./phases/review/graph.js";
import * as verifyPhase from "./phases/verify/graph.js";

const PHASES = ["define", "plan", "build", "verify", "review"] as const;

// LOOK AT OTHER SKILLS and move their "when to use" and "interaction with other skills" into the router context"
const ROUTER_SYSTEM = `You are the phase router for a software engineering agent. Given the
task and the work done so far, pick which lifecycle PHASE to (re)enter next:

- define    : requirements unclear, or nothing built yet
- plan       : requirements clear, needs task breakdown
- build      : plan exists, needs code
- verify     : code exists, needs tests / cleanup
- review     : ready for review and sign-off

Reply with ONLY a JSON object, no prose, no code fences:
{"phase": "define|plan|build|verify|review", "reason": "<one short sentence>"}`;

// --------------------------------------------------------------------- router node

function makeRouter(ctx: NodeContext): NodeFn {
  return async (state) => {
    const history = state.history?.length
      ? state.history.map((h) => `- ${h.skill}: ${h.summary}`).join("\n")
      : "(none)";
    const message =
      `TASK:\n${state.task ?? ""}\n\n` +
      `WORK DONE SO FAR:\n${history}\n\n` +
      "Pick the phase to enter next.";
    let phase = "define";
    let reason = "";
    try {
      const decision = await ctx.provider.runJson(message, { system: ROUTER_SYSTEM, model: ctx.model });
      phase = String(decision.phase ?? "define").trim().toLowerCase();
      reason = typeof decision.reason === "string" ? decision.reason : "";
    } catch (e) {
      phase = "define";
      reason = `router error: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (!(PHASES as readonly string[]).includes(phase)) {
      reason = `unknown phase '${phase}', defaulting to define`;
      phase = "define";
    }
    return { entry_phase: phase, log: [`[router] -> ${phase} (${reason})`] };
  };
}

// --------------------------------------------------------------- top-level routing

const routePhase = (state: AgentStateType): string => state.entry_phase ?? "define";
const afterBuild = (state: AgentStateType): string => (state.confident ? "verify" : "router");
const afterReview = (state: AgentStateType): string => (state.human_approved ? END : "router");

// ------------------------------------------------------------------------ assembly

export function buildGraph(
  ctx: NodeContext = defaultContext(),
  opts: { checkpointer?: BaseCheckpointSaver } = {},
) {
  const g = new StateGraph(AgentState)
    .addNode("router", traced("router", makeRouter(ctx)))
    .addNode("define", definePhase.build(ctx))
    .addNode("plan", planPhase.build(ctx))
    .addNode("build", buildPhase.build(ctx))
    .addNode("verify", verifyPhase.build(ctx))
    .addNode("review", reviewPhase.build(ctx));

  g.addEdge(START, "router");
  g.addConditionalEdges(
    "router",
    routePhase,
    Object.fromEntries(PHASES.map((p) => [p, p])),
  );

  g.addEdge("define", "plan");
  g.addEdge("plan", "build");
  g.addConditionalEdges("build", afterBuild, { verify: "verify", router: "router" });
  g.addEdge("verify", "review");
  g.addConditionalEdges("review", afterReview, { [END]: END, router: "router" });

  return g.compile({ checkpointer: opts.checkpointer });
}

// Compiled graph for `langgraph.json` / LangGraph Platform (platform supplies persistence).
export const graph = buildGraph(
  defaultContext({
    provider: resolveProvider(process.env.AGENT_PROVIDER),
    permissionMode: (process.env.AGENT_PERMISSION_MODE as PermissionMode) || "acceptEdits",
    model: process.env.AGENT_MODEL || null,
  }),
);
