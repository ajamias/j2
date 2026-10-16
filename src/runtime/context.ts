import type { WorkingEntry } from "./state.js";

export interface SkillArgumentInput {
  name: string;
  description: string;
  required: boolean;
}

/** The parts of a node's context that are fixed when the workflow is generated. */
export interface StaticInput {
  whenToUse: string;
  produces: string;
  arguments: SkillArgumentInput[];
  /** Files bundled with the skill, relative to its directory. */
  files: string[];
}

export interface SkillReference {
  nodeId: string;
  description: string;
}

/**
 * One node's context object, assembled fresh on every agent iteration.
 *
 * The five parts map onto the workflow's channels: `input` and `references`
 * are baked into the generated file, `upstream` is projected from earlier
 * nodes' output channels, `working` is this node's append-only journal, and
 * `output` is what it writes back.
 */
export interface SkillContext<TOutput = unknown> {
  nodeId: string;
  title: string;
  goal: string;
  workdir: string;
  input: StaticInput;
  upstream: Record<string, unknown>;
  working: readonly WorkingEntry[];
  output?: TOutput;
  references: readonly SkillReference[];
}

export interface ContextSources {
  nodeId: string;
  title: string;
  reads: readonly string[];
  input: StaticInput;
  references: readonly SkillReference[];
  workingChannel: string;
  outputChannel: string;
}

export function contextFromState<TOutput>(
  sources: ContextSources,
  state: Record<string, unknown>,
): SkillContext<TOutput> {
  const upstream: Record<string, unknown> = {};
  for (const nodeId of sources.reads) {
    const value = state[`${nodeId}__output`];
    if (value !== undefined) upstream[nodeId] = value;
  }

  return {
    nodeId: sources.nodeId,
    title: sources.title,
    goal: String(state.goal ?? ""),
    workdir: String(state.workdir ?? process.cwd()),
    input: sources.input,
    upstream,
    working: (state[sources.workingChannel] as WorkingEntry[] | undefined) ?? [],
    output: state[sources.outputChannel] as TOutput | undefined,
    references: sources.references,
  };
}

/** Renders the context as the user turn that opens a node's agent loop. */
export function renderContext(context: SkillContext): string {
  const sections: string[] = [
    `# Task\n${context.goal}`,
    `# Workspace\n${context.workdir}`,
    `# Your step: ${context.title}\nWhen this step applies: ${context.input.whenToUse}\nWhat you must produce: ${context.input.produces}`,
  ];

  if (context.input.arguments.length > 0) {
    sections.push(
      `# Arguments\n${context.input.arguments
        .map((argument) => `- ${argument.name}${argument.required ? " (required)" : ""}: ${argument.description}`)
        .join("\n")}`,
    );
  }

  if (context.input.files.length > 0) {
    sections.push(`# Files bundled with this skill\n${context.input.files.map((file) => `- ${file}`).join("\n")}`);
  }

  const upstreamIds = Object.keys(context.upstream);
  if (upstreamIds.length > 0) {
    sections.push(
      `# Results from earlier steps\n${upstreamIds
        .map((id) => `## ${id}\n\`\`\`json\n${JSON.stringify(context.upstream[id], null, 2)}\n\`\`\``)
        .join("\n\n")}`,
    );
  }

  if (context.references.length > 0) {
    sections.push(
      `# Related steps in this workflow\n${context.references
        .map((reference) => `- ${reference.nodeId}: ${reference.description}`)
        .join("\n")}`,
    );
  }

  if (context.working.length > 0) {
    sections.push(
      `# Your notes so far\n${context.working
        .map((entry) => `[${entry.iteration}] ${entry.kind}: ${entry.text}`)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}
