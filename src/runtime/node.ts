import { GraphInterrupt, type Interrupt } from "@langchain/langgraph";
import { createAgent, humanInTheLoopMiddleware, modelRetryMiddleware, toolStrategy } from "langchain";
import type { z } from "zod";
import type { ModelSize } from "../providers/types.js";
import { log } from "../util/log.js";
import { createRetryPolicy } from "../util/retry.js";
import { contextFromState, renderContext, type SkillReference, type StaticInput } from "./context.js";
import { shellApprovalConfig } from "./hitl.js";
import type { Artifact, WorkingEntry } from "./state.js";
import { builtinTools } from "./tools/index.js";
import type { BuildOptions } from "./workflow.js";

/**
 * How many working-context entries are replayed into a node's prompt. The
 * journal is append-only and a long interactive node can accumulate hundreds;
 * without a window every one of them re-enters the prompt each iteration.
 */
const WORKING_WINDOW = 40;

export interface SkillNodeDefinition<TOutput extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  title: string;
  size: ModelSize;
  /** Absolute path to the skill directory this node was generated from. */
  skillDir: string;
  staticInput: StaticInput;
  references: SkillReference[];
  /** Ids of earlier nodes whose output this one reads. */
  reads: string[];
  workingChannel: string;
  outputChannel: string;
  outputSchema: TOutput;
  tools: { allow: string[]; deny: string[] };
  maxIterations: number;
  systemPrompt: string;
}

/** Identity with inference. Generated files call this for every node. */
export function defineSkillNode<TOutput extends z.ZodTypeAny>(
  definition: SkillNodeDefinition<TOutput>,
): SkillNodeDefinition<TOutput> {
  return definition;
}

export type NodeFn = (state: Record<string, unknown>) => Promise<Record<string, unknown>>;

/**
 * Turns a node definition into a LangGraph node.
 *
 * Each call assembles the node's context object from state, runs one agent
 * loop over it, and writes back three things: the structured output, a digest
 * of the loop into the append-only working channel, and any files written.
 * The agent's message transcript deliberately never enters workflow state.
 */
export function makeSkillNode(
  definition: SkillNodeDefinition,
  options: BuildOptions,
): NodeFn {
  return async (state) => {
    const artifacts: Artifact[] = [];
    const context = contextFromState(
      {
        nodeId: definition.id,
        title: definition.title,
        reads: definition.reads,
        input: definition.staticInput,
        references: definition.references,
        workingChannel: definition.workingChannel,
        outputChannel: definition.outputChannel,
      },
      state,
    );
    const windowed = { ...context, working: context.working.slice(-WORKING_WINDOW) };

    const { tools, names } = builtinTools({
      workdir: context.workdir,
      nodeId: definition.id,
      allow: definition.tools.allow,
      onWrite: (path, note) => artifacts.push({ path, note }),
    });

    const policy = createRetryPolicy(definition.id);
    type Middleware = NonNullable<Parameters<typeof createAgent>[0]["middleware"]>[number];
    const middleware: Middleware[] = [modelRetryMiddleware({ retryOn: policy.retryOn })];

    // Shell access is approved per call unless the operator opted out.
    if (names.includes("run_command") && !options.autoApprove) {
      middleware.push(humanInTheLoopMiddleware({ interruptOn: shellApprovalConfig(definition.id) }));
    }

    const agent = createAgent({
      model: options.provider.chat(definition.size, options.overrides),
      systemPrompt: definition.systemPrompt,
      tools,
      responseFormat: toolStrategy(definition.outputSchema),
      middleware,
      // Inherit the parent graph's checkpointer so an interrupt inside this
      // agent resumes the agent, rather than replaying it from the top.
      checkpointer: true,
      name: definition.id,
    });

    log.info(`▶ ${definition.id} (${options.provider.modelId(definition.size, options.overrides)})`);
    const started = Date.now();

    const result = (await agent.invoke(
      { messages: [{ role: "user", content: renderContext(windowed) }] },
      { recursionLimit: definition.maxIterations * 2 + 10 },
    )) as {
      messages?: Array<{ getType?: () => string; text?: string }>;
      structuredResponse?: unknown;
      __interrupt__?: Interrupt[];
    };

    // If the agent absorbed the interrupt instead of letting it bubble, re-raise
    // it so the workflow — and the CLI's pump — actually pause.
    if (result.__interrupt__?.length) throw new GraphInterrupt(result.__interrupt__);

    if (result.structuredResponse == null) {
      // The retry middleware absorbs the errors it handles, so an empty result
      // usually has a real cause behind it. Surface that, not the symptom.
      throw (
        policy.lastError() ??
        new Error(`${definition.id}: the agent finished without producing its structured output`)
      );
    }

    const output = definition.outputSchema.parse(result.structuredResponse) as unknown;
    const elapsed = Date.now() - started;
    log.info(`✓ ${definition.id} (${elapsed}ms)`);

    return {
      [definition.outputChannel]: output,
      [definition.workingChannel]: digest(result.messages ?? [], context.working.length),
      artifacts,
      log: [`[${definition.id}] produced ${definition.outputChannel} in ${elapsed}ms`],
    };
  };
}

/**
 * Condenses the agent's transcript into working-context entries. Only assistant
 * text survives — tool arguments and results are often large and are already
 * reflected in the workspace.
 */
function digest(
  messages: Array<{ getType?: () => string; text?: string }>,
  startIteration: number,
): WorkingEntry[] {
  const entries: WorkingEntry[] = [];
  let iteration = startIteration;

  for (const message of messages) {
    if (message.getType?.() !== "ai") continue;
    const text = message.text?.trim();
    if (!text) continue;
    iteration += 1;
    entries.push({ iteration, kind: "thought", text });
  }
  return entries;
}
