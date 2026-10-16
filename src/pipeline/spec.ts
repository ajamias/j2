import { z } from "zod";
import { modelSizeSchema } from "../providers/types.js";

/**
 * A closed, flat type language.
 *
 * It is a single enum plus two optional members rather than nested unions, for
 * two reasons learned the hard way against real providers: a shared schema
 * instance is emitted as a `$ref` into `#/properties/...`, which several
 * providers reject, and inlining nested unions to avoid that blows past the
 * grammar-size limit on strict structured output. One level of nesting —
 * a list of flat records — is as deep as a context schema needs to go.
 */
const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

export const SCALAR_KINDS = ["string", "number", "boolean"] as const;

export const FIELD_KINDS = [
  "string",
  "number",
  "boolean",
  "enum",
  "stringList",
  "numberList",
  "fileList",
  "objectList",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** A fresh field schema. Call it per use site; never share the result. */
export function fieldSpec() {
  return z.object({
    name: z.string().regex(IDENTIFIER, "must be lowerCamelCase"),
    description: z.string(),
    optional: z.boolean().default(false),
    kind: z
      .enum(FIELD_KINDS)
      .describe(
        "string/number/boolean for a single value; enum for one of a fixed set; stringList/numberList for a list of values; fileList for files written, each { path, summary }; objectList for a list of records.",
      ),
    values: z.array(z.string()).optional().describe("The allowed values. Only for kind 'enum'."),
    itemFields: z
      .array(
        z.object({
          name: z.string().regex(IDENTIFIER, "must be lowerCamelCase"),
          description: z.string(),
          kind: z.enum(SCALAR_KINDS),
        }),
      )
      .optional()
      .describe("The fields of each record. Only for kind 'objectList'."),
  });
}
export type FieldSpec = z.infer<ReturnType<typeof fieldSpec>>;

export const toolPolicySchema = z.object({
  allow: z.array(z.string()),
  deny: z.array(z.string()),
});
export type ToolPolicy = z.infer<typeof toolPolicySchema>;

/**
 * One LangGraph node. Its context object has five parts:
 *
 * - structured input — `staticInput`, derived deterministically from SKILL.md
 * - implicit input   — the outputs of the nodes named in `reads`
 * - working context  — append-only, a fixed `{ iteration, kind, text }` shape
 * - output context   — `outputFields`, designed by the model
 * - references       — sibling skills this one points at
 */
export const skillNodeSpecSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  skillSlug: z.string(),
  title: z.string(),
  size: modelSizeSchema,
  maxIterations: z.number().int().min(1).max(200),
  interactive: z.boolean(),
  reads: z.array(z.string()),
  references: z.array(z.object({ nodeId: z.string(), description: z.string() })),
  staticInput: z.object({
    whenToUse: z.string(),
    produces: z.string(),
    arguments: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean(),
      }),
    ),
    files: z.array(z.string()),
  }),
  outputFields: z.array(fieldSpec()).min(1),
  systemGuidance: z.string(),
  skillBody: z.string(),
  skillDir: z.string(),
  tools: toolPolicySchema,
});
export type SkillNodeSpec = z.infer<typeof skillNodeSpecSchema>;

export const workflowSpecSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string(),
  description: z.string(),
  setKind: z.string(),
  rationale: z.string(),
  /** Node ids in execution order. The graph is a straight chain over this. */
  order: z.array(z.string()).min(1),
  nodes: z.array(skillNodeSpecSchema).min(1),
  source: z.string(),
});
export type WorkflowSpec = z.infer<typeof workflowSpecSchema>;

/** Channel names are derived, never model-authored, so they cannot collide. */
export const workingChannel = (nodeId: string): string => `${nodeId}__working`;
export const outputChannel = (nodeId: string): string => `${nodeId}__output`;
