import { existsSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { ensureDir, runtimeEntryPath, workflowPaths } from "../config/paths.js";
import { emitWorkflow } from "../codegen/emit.js";
import { hashSource, writeManifest } from "../codegen/manifest.js";
import { checkWorkflow, transpileWorkflow } from "../codegen/transpile.js";
import { assembleWorkflow, assertUsableSlug, toSlug } from "../pipeline/assemble.js";
import { classifySkills } from "../pipeline/classify.js";
import { designNodes } from "../pipeline/design.js";
import { HarnessName, resolveHarness } from "../harness/registry.js";
import { ProviderName, resolveProvider } from "../providers/registry.js";
import type { ModelOverrides } from "../providers/types.js";
import { importSkills } from "../skills/import.js";
import { log } from "../util/log.js";
import { J2_VERSION } from "../version.js";

export interface GenerateOptions {
  skillDir: string;
  provider: string;
  harness?: string;
  overrides: ModelOverrides;
  name?: string;
  force?: boolean;
  check?: boolean;
  allowShell?: boolean;
  denyTool?: string[];
  dryRun?: boolean;
}

export async function runGenerate(options: GenerateOptions): Promise<void> {
  const skillsRoot = resolve(options.skillDir);
  const provider = resolveProvider(options.provider as ProviderName | undefined);
  const harness = resolveHarness(options.harness as HarnessName | undefined, provider.name);

  // TODO: just put the skill body into a field, do not summarize it.
  // Summarizing will be done in the generation phase. Keep other
  // fields like when-to-use, inputs, outputs, etc.
  const skills = await importSkills(skillsRoot, { provider, overrides: options.overrides, harness });

  // TODO: first, for each skill, use Jev to read the skill and all other skill under the referenced field, then make Jev make a choice for each skill choosing if it should be routed to.
  // TODO: do the same as above, but for context (in the same request)

  // also consider having an overarching orchestrator node that just runs Jev to make the choice of which skill to run next.

  // represent graph as adjacency list (map skill name to list of next potential skills)
  const executionFlows = generateExecutionFlow(skills, provider, harness);

  const contextFlows = generateContextFlow(skills, provider, harness);

  /**
  const spec = assembleWorkflow(skills, classification, designs, {
    source,
    slug: options.name ? assertUsableSlug(toSlug(options.name)) : undefined,
    allowShell: options.allowShell,
    denyTools: options.denyTool,
  });

  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify(spec, null, 2)}\n`);
    return;
  }

  const paths = workflowPaths(spec.slug);
  if (existsSync(paths.dir) && !options.force) {
    throw new J2Error(
      "usage",
      `workflow '${spec.slug}' already exists at ${paths.dir}`,
      "overwrite it with --force, or pick another name with --name",
    );
  }
  if (existsSync(paths.dir) && options.force) rmSync(paths.dir, { recursive: true, force: true });

  const generatedAt = new Date().toISOString();
  const runtimePath = runtimeEntryPath();
  const code = emitWorkflow(spec, {
    runtimePath,
    provider: provider.name,
    j2Version: J2_VERSION,
    generatedAt,
  });

  ensureDir(paths.dir);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(paths.source, code, "utf-8");
  transpileWorkflow(code, paths.source, paths.compiled);
  if (options.check) checkWorkflow(paths.source);

  writeManifest(paths.manifest, {
    id: spec.slug,
    title: spec.title,
    description: spec.description,
    setKind: spec.setKind,
    order: [...spec.order],
    nodes: spec.nodes.map((node) => ({ id: node.id, title: node.title, size: node.size })),
    provider: provider.name,
    source,
    runtime: runtimePath,
    j2Version: J2_VERSION,
    generatedAt,
    sourceHash: hashSource(code),
  });

  process.stdout.write(`${paths.source}\n`);
  log.info(`run it with: j2 run ${spec.slug} --goal "<your task>"`);
  */
}
