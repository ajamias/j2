import {
  END,
  MemorySaver,
  START,
  StateGraph,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import type { z } from "zod";
import type { ModelOverrides, ProviderStrategy } from "../providers/types.js";
import { log } from "../util/log.js";
import { makeSkillNode, type SkillNodeDefinition } from "./node.js";

export interface BuildOptions {
  provider: ProviderStrategy;
  overrides?: ModelOverrides;
  /** Root every tool is confined to. */
  workdir: string;
  /** Skip the per-call approval gate on `run_command`. Container use only. */
  autoApprove?: boolean;
  checkpointer?: BaseCheckpointSaver;
}

export interface WorkflowDefinition<TState extends z.ZodObject<z.ZodRawShape>> {
  State: TState;
  nodes: readonly SkillNodeDefinition[];
  order: readonly string[];
}

export interface WorkflowMeta {
  id: string;
  title: string;
  description: string;
  setKind: string;
  order: readonly string[];
  provider: string;
  source: string;
  runtime: string;
  j2Version: string;
  generatedAt: string;
}

/** The shape every generated workflow module default-exports. */
export interface WorkflowModule<TState extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  meta: WorkflowMeta;
  State: TState;
  nodes: readonly SkillNodeDefinition[];
  order: readonly string[];
  build: (options: BuildOptions) => CompiledWorkflow;
}

interface GraphBuilder {
  addNode(name: string, fn: ReturnType<typeof makeSkillNode>): void;
  addEdge(from: string, to: string): void;
  compile(options: { checkpointer: BaseCheckpointSaver }): CompiledWorkflow;
}

/** What `buildWorkflow` hands back: enough of a compiled graph to drive a run. */
export interface CompiledWorkflow {
  invoke(
    input: unknown,
    config?: { configurable?: Record<string, unknown>; recursionLimit?: number },
  ): Promise<Record<string, unknown>>;
}

/**
 * Compiles a workflow into a straight chain: START -> order[0] -> … -> END.
 *
 * The chain is deliberately the only topology. Conditional edges are a
 * deliberate non-goal for now; `order` is a list so that adding them later is
 * additive rather than a rewrite.
 *
 * Honesty: dishonest — each compiled node may read/write `options.workdir`
 * and call out to a model provider when invoked; `options.checkpointer`
 * defaults to an in-memory one if not supplied.
 * Idempotency: idempotent as a build step — compiling the same definition
 * twice yields equivalent graphs; running the compiled graph is not
 * idempotent.
 */
export function buildWorkflow<TState extends z.ZodObject<z.ZodRawShape>>(
  definition: WorkflowDefinition<TState>,
  options: BuildOptions,
): CompiledWorkflow {
  log.debug(`building workflow with ${definition.order.length} node(s)`);
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));

  // Node names and the state shape are only known at runtime — they come from
  // the generated file — so the builder is driven through a structural view of
  // StateGraph rather than its (statically unresolvable) generics.
  const graph = new StateGraph(definition.State as never) as unknown as GraphBuilder;

  for (const id of definition.order) {
    const node = byId.get(id);
    if (!node) throw new Error(`workflow order names an unknown node '${id}'`);
    graph.addNode(id, makeSkillNode(node, options));
  }

  graph.addEdge(START, definition.order[0]);
  for (let index = 1; index < definition.order.length; index += 1) {
    graph.addEdge(definition.order[index - 1], definition.order[index]);
  }
  graph.addEdge(definition.order[definition.order.length - 1], END);

  const compiled = graph.compile({ checkpointer: options.checkpointer ?? createCheckpointer() });
  log.info(`built workflow with ${definition.order.length} node(s)`);
  return compiled;
}

/**
 * Checkpointer seam.
 *
 * `MemorySaver` is in-process only: it keeps a thread alive between the
 * `invoke` calls of the interrupt pump, which is all a single `j2 run` needs.
 * Ctrl-C loses the run. Cross-process resume means swapping this one function
 * for a SQLite saver.
 */
export function createCheckpointer(): BaseCheckpointSaver {
  return new MemorySaver();
}
