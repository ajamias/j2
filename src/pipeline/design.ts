import { z } from "zod";
import { modelSizeSchema, type ModelOverrides, type ProviderStrategy } from "../providers/types.js";
import { TOOL_NAMES } from "../runtime/tools/names.js";
import type { IngestedSkill } from "../skills/schema.js";
import { log } from "../util/log.js";
import { structuredCall } from "../util/structured.js";
import { fieldSpec } from "./spec.js";

export const nodeDesignSchema = z.object({
  outputFields: z
    .array(fieldSpec())
    .min(1)
    .describe("The schema of what this node hands to the nodes after it. One field per distinct thing the skill produces. Keep it small — five fields or fewer unless the skill genuinely produces more."),
  reads: z
    .array(z.string())
    .describe("Slugs of EARLIER skills in the order whose output this node needs. Empty if it needs nothing from upstream."),
  tools: z
    .array(z.enum(TOOL_NAMES))
    .describe("The tools this node's agent loop needs. Request the minimum: a skill that only talks to the user needs ask_human and nothing else."),
  size: modelSizeSchema.describe("Model size for this node's agent loop. Use 'large' unless the work is genuinely mechanical."),
  maxIterations: z
    .number()
    .int()
    .min(1)
    .max(200)
    .describe("Upper bound on agent loop turns for this node."),
  systemGuidance: z
    .string()
    .describe("Two to five sentences appended after the skill's own instructions, telling the agent how to use its upstream context and what its output fields mean. Do not restate the skill."),
});
export type NodeDesign = z.infer<typeof nodeDesignSchema>;

const SYSTEM = [
  "You are designing one node of a sequential agent workflow.",
  "The node runs one skill in an agent loop with tools, then must emit a structured result for the nodes after it.",
  "Design that result schema, pick the node's tools, and write the guidance that connects it to its upstream context.",
  "Field names are lowerCamelCase. Every field needs a description that tells the agent what to put there.",
].join(" ");

export interface DesignOptions {
  provider: ProviderStrategy;
  overrides?: ModelOverrides;
  /** Slugs in execution order; only earlier entries are valid `reads`. */
  order: string[];
  setKind: string;
}

/**
 * Intent: asks the model to design one workflow node for `skill` — its output
 * schema, tools, model size, and the guidance that wires it to upstream nodes.
 * Parameters: `upstream` are earlier skills in execution order, the only
 * valid sources for the returned `reads`. Returns a `NodeDesign` with `reads`
 * filtered to actual upstream slugs.
 * Honesty: dishonest — makes a network call to a model provider via
 * `structuredCall`.
 * Idempotency: not idempotent; the model may return a different design on
 * repeated calls with the same inputs.
 */
export async function designNode(
  skill: IngestedSkill,
  upstream: IngestedSkill[],
  options: DesignOptions,
): Promise<NodeDesign> {
  const upstreamBlock = upstream.length
    ? upstream.map((s) => `- ${s.slug}: produces ${s.produces}`).join("\n")
    : "(none — this is the first node)";

  log.debug(`designing node ${skill.slug}`);
  const design = await structuredCall({
    model: () => options.provider.chat("medium", options.overrides),
    schema: nodeDesignSchema,
    system: SYSTEM,
    label: `design:${skill.slug}`,
    user: [
      `Workflow kind: ${options.setKind}`,
      `Full order: ${options.order.join(" -> ")}`,
      "",
      `Designing node: ${skill.slug}`,
      `Summary: ${skill.summary}`,
      `When to use: ${skill.whenToUse}`,
      `Produces: ${skill.produces}`,
      `Interactive: ${skill.interactive}`,
      skill.allowedTools?.length ? `Skill declares allowed tools: ${skill.allowedTools.join(", ")}` : "",
      "",
      "Nodes that run before it:",
      upstreamBlock,
      "",
      "SKILL.md body:",
      "```markdown",
      skill.body,
      "```",
    ]
      .filter((line) => line !== "")
      .join("\n"),
  });
  log.info(`designed node ${skill.slug}`);

  return { ...design, reads: design.reads.filter((slug) => upstream.some((s) => s.slug === slug)) };
}

/**
 * Intent: designs every node of the workflow. Each call needs only the
 * upstream skills, which are fixed by the classification, so the calls are
 * independent and run concurrently.
 * Parameters: `ordered` is the full skill list in execution order. Returns a
 * map from skill slug to its `NodeDesign`.
 * Honesty: dishonest — invokes `designNode`, which is dishonest (network
 * calls to a model provider).
 * Idempotency: not idempotent; see `designNode`.
 */
export async function designNodes(
  ordered: IngestedSkill[],
  options: DesignOptions,
): Promise<Map<string, NodeDesign>> {
  log.debug(`designing ${ordered.length} node(s)`);
  const designs = await Promise.all(
    ordered.map((skill, index) => designNode(skill, ordered.slice(0, index), options)),
  );
  log.info(`designed ${ordered.length} node(s)`);
  return new Map(ordered.map((skill, index) => [skill.slug, designs[index]]));
}
