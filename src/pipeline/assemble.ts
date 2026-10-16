import { normalizeToolName, SHELL_TOOL, TOOL_NAMES, type ToolName } from "../runtime/tools/names.js";
import type { IngestedSkill } from "../skills/schema.js";
import { J2Error } from "../util/errors.js";
import { log } from "../util/log.js";
import type { Classification } from "./classify.js";
import type { NodeDesign } from "./design.js";
import { workflowSpecSchema, type SkillNodeSpec, type WorkflowSpec } from "./spec.js";

export interface AssembleOptions {
  /** Absolute path the skills were read from. */
  source: string;
  /** Overrides the slug derived from the classification title. */
  slug?: string;
  /** Without this, `run_command` is stripped from every node. */
  allowShell?: boolean;
  /** Tools denied globally, whatever a skill or the designer asked for. */
  denyTools?: string[];
}

/**
 * Turns ingestion + classification + per-node designs into a validated
 * `WorkflowSpec`. Pure: no model calls, no filesystem writes. Everything a
 * model could get wrong is corrected or rejected here, before codegen.
 */
export function assembleWorkflow(
  skills: IngestedSkill[],
  classification: Classification,
  designs: Map<string, NodeDesign>,
  options: AssembleOptions,
): WorkflowSpec {
  const bySlug = new Map(skills.map((skill) => [skill.slug, skill]));
  const ordered = classification.order.map((slug) => {
    const skill = bySlug.get(slug);
    if (!skill) throw new J2Error("codegen", `ordering names an unknown skill '${slug}'`);
    return skill;
  });

  const nodeIds = new Map(ordered.map((skill) => [skill.slug, toNodeId(skill.slug)]));
  assertUniqueNodeIds(nodeIds);

  const nodes: SkillNodeSpec[] = ordered.map((skill, index) => {
    const design = designs.get(skill.slug);
    if (!design) throw new J2Error("codegen", `no node design for skill '${skill.slug}'`);

    const upstreamSlugs = new Set(ordered.slice(0, index).map((s) => s.slug));
    const reads = design.reads
      .filter((slug) => upstreamSlugs.has(slug))
      .map((slug) => nodeIds.get(slug)!);

    return {
      id: nodeIds.get(skill.slug)!,
      skillSlug: skill.slug,
      title: skill.name,
      size: design.size,
      maxIterations: design.maxIterations,
      interactive: skill.interactive,
      reads,
      references: resolveReferences(skill, nodeIds, bySlug),
      staticInput: {
        whenToUse: skill.whenToUse,
        produces: skill.produces,
        arguments: (skill.arguments ?? []).map((argument) => ({
          name: argument.name,
          description: argument.description ?? "",
          required: argument.required ?? false,
        })),
        files: skill.files,
      },
      outputFields: design.outputFields,
      systemGuidance: design.systemGuidance,
      skillBody: skill.body,
      skillDir: skill.dir,
      tools: resolveTools(skill, design, options),
    };
  });

  return workflowSpecSchema.parse({
    slug: options.slug ?? toSlug(classification.title),
    title: classification.title,
    description: classification.description,
    setKind: classification.setKind,
    rationale: classification.rationale,
    order: nodes.map((node) => node.id),
    nodes,
    source: options.source,
  });
}

/**
 * Tool resolution, most permissive to least. Each step can only remove:
 * the designer's request is the ceiling, and the CLI can never widen it.
 */
function resolveTools(
  skill: IngestedSkill,
  design: NodeDesign,
  options: AssembleOptions,
): { allow: ToolName[]; deny: ToolName[] } {
  let allow = new Set<ToolName>(design.tools);

  const declared = normalizeAll(skill.allowedTools, skill.slug);
  if (declared.length > 0) {
    allow = new Set([...allow].filter((tool) => declared.includes(tool)));
  }

  for (const tool of normalizeAll(options.denyTools, "--deny-tool")) allow.delete(tool);

  if (!options.allowShell) allow.delete(SHELL_TOOL);
  // A skill that pauses to ask the user cannot do so without this tool.
  if (skill.interactive) allow.add("ask_human");

  const ordered = TOOL_NAMES.filter((tool) => allow.has(tool));
  return { allow: ordered, deny: TOOL_NAMES.filter((tool) => !allow.has(tool)) };
}

function normalizeAll(raw: string[] | undefined, context: string): ToolName[] {
  const resolved: ToolName[] = [];
  for (const name of raw ?? []) {
    const tool = normalizeToolName(name);
    if (tool) resolved.push(tool);
    else log.warn(`${context}: ignoring unknown tool name '${name}'`);
  }
  return resolved;
}

function resolveReferences(
  skill: IngestedSkill,
  nodeIds: Map<string, string>,
  bySlug: Map<string, IngestedSkill>,
): Array<{ nodeId: string; description: string }> {
  const seen = new Set<string>();
  const references: Array<{ nodeId: string; description: string }> = [];

  for (const raw of skill.references ?? []) {
    const slug = toSlug(raw);
    const nodeId = nodeIds.get(slug);
    if (!nodeId || slug === skill.slug || seen.has(nodeId)) continue;
    seen.add(nodeId);
    references.push({ nodeId, description: bySlug.get(slug)?.summary ?? "" });
  }
  return references;
}

function assertUniqueNodeIds(nodeIds: Map<string, string>): void {
  const seen = new Map<string, string>();
  for (const [slug, id] of nodeIds) {
    const clash = seen.get(id);
    if (clash) {
      throw new J2Error(
        "codegen",
        `skills '${clash}' and '${slug}' both map to the node id '${id}'`,
        "rename one of the skill directories",
      );
    }
    seen.set(id, slug);
  }
}

/** `interview-me` -> `interview_me`. Must be a valid TypeScript identifier. */
export function toNodeId(slug: string): string {
  const id = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(id) ? id : `skill_${id}`;
}

/** `Define-phase Intake!` -> `define-phase-intake`. */
export function toSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return slug || "workflow";
}

const RESERVED_SLUGS = new Set(["generate", "list", "run"]);

export function assertUsableSlug(slug: string): string {
  if (RESERVED_SLUGS.has(slug)) {
    throw new J2Error(
      "usage",
      `'${slug}' is a reserved workflow name`,
      "pick another with --name",
    );
  }
  return slug;
}
