import { Command } from "@langchain/langgraph";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readManifest } from "../codegen/manifest.js";
import { transpileWorkflow } from "../codegen/transpile.js";
import { workflowPaths } from "../config/paths.js";
import { resolveProvider } from "../providers/registry.js";
import type { ModelOverrides } from "../providers/types.js";
import { isAskHumanRequest } from "../runtime/hitl.js";
import type { WorkflowModule } from "../runtime/workflow.js";
import { J2Error } from "../util/errors.js";
import { log } from "../util/log.js";
import { createPrompter, type Prompter } from "./io.js";

export interface RunOptions {
  workflow: string;
  goal: string;
  workdir: string;
  provider?: string;
  overrides: ModelOverrides;
  thread?: string;
  recursionLimit: number;
  yes?: boolean;
}

/**
 * Intent: loads a generated (or hand-authored) workflow module, runs it
 * against `options.goal`, pumping any human-in-the-loop interrupts through
 * `prompter` until the graph completes, then prints the result.
 * Parameters: see `RunOptions`. Resolves once the run has finished and its
 * output has been reported; throws `J2Error` on recursion-limit overrun or
 * if the resolved module has no default workflow export.
 * Honesty: dishonest — dynamically imports and executes an arbitrary
 * workflow module, performs model-provider network calls, reads/writes
 * `options.workdir`, and prompts on stdin/stdout.
 * Idempotency: not idempotent; each invocation runs the workflow fresh
 * (or resumes a thread) and may have side effects (tool calls, file writes).
 */
export async function runRun(options: RunOptions): Promise<void> {
  const { modulePath, manifestProvider } = resolveWorkflow(options.workflow);

  const provider = resolveProvider(options.provider ?? manifestProvider);
  if (!process.env.J2_FAKE_MODEL) await provider.preflight(options.overrides);

  log.debug(`loading workflow module ${modulePath}`);
  const loaded = (await import(pathToFileURL(modulePath).href)) as { default?: WorkflowModule };
  const workflow = loaded.default;
  if (!workflow?.build) {
    throw new J2Error("runtime", `${modulePath} does not default-export a j2 workflow`);
  }

  const app = workflow.build({
    provider,
    overrides: options.overrides,
    workdir: resolve(options.workdir),
    autoApprove: options.yes,
  });

  const config = {
    configurable: { thread_id: options.thread ?? `run-${Date.now()}` },
    recursionLimit: options.recursionLimit,
  };

  const prompter = createPrompter();
  try {
    log.info(`starting workflow ${options.workflow}`);
    let result = await app.invoke(
      { goal: options.goal, workdir: resolve(options.workdir) },
      config,
    );

    // The interrupt pump: a node paused to ask the user something, so answer it
    // and resume the same thread until the graph runs to completion.
    while (hasInterrupt(result)) {
      const resume = await answer(result.__interrupt__[0]?.value, prompter);
      result = await app.invoke(new Command({ resume }), config);
    }

    log.info(`workflow ${options.workflow} finished`);
    report(workflow, result);
  } catch (error) {
    if (error instanceof Error && error.name === "GraphRecursionError") {
      throw new J2Error(
        "runtime",
        `the workflow exceeded ${options.recursionLimit} steps`,
        "raise it with --recursion-limit, or lower a node's maxIterations in the generated file",
      );
    }
    throw error;
  } finally {
    prompter.close();
  }
}

interface InterruptedState {
  __interrupt__: Array<{ value?: unknown }>;
}

function hasInterrupt(state: Record<string, unknown>): state is Record<string, unknown> & InterruptedState {
  return Array.isArray((state as unknown as InterruptedState).__interrupt__);
}

interface HitlRequest {
  actionRequests: Array<{ name: string; args: Record<string, unknown>; description?: string }>;
}

function isHitlRequest(value: unknown): value is HitlRequest {
  return Array.isArray((value as HitlRequest | undefined)?.actionRequests);
}

/**
 * Intent: turns an interrupt payload into the value the graph should resume
 * with. Two shapes reach here: a node asking a question, and the
 * shell-approval middleware asking to run a command.
 * Parameters: `payload` is the raw interrupt value; `prompter` is used to
 * collect the human's answer. Returns the resume value for the graph.
 * Honesty: dishonest — prompts on stdin/stdout via `prompter`.
 * Idempotency: not idempotent; each call blocks on a fresh human response.
 */
async function answer(payload: unknown, prompter: Prompter): Promise<unknown> {
  if (isAskHumanRequest(payload)) {
    return prompter.ask(`[${payload.nodeId}] ${payload.question}`, payload.choices);
  }

  if (isHitlRequest(payload)) {
    const decisions = [];
    for (const action of payload.actionRequests) {
      const summary = `${action.name} ${JSON.stringify(action.args)}`;
      const choice = await prompter.ask(
        `${action.description ?? "approve this action?"}\n  ${summary}`,
        ["approve", "reject"],
      );
      decisions.push(
        choice === "approve"
          ? { type: "approve" as const }
          : { type: "reject" as const, message: "The user declined to run this command." },
      );
    }
    return { decisions };
  }

  // Unknown shape: show it and take a free-text answer rather than hanging.
  return prompter.ask(`the workflow paused and asked:\n${JSON.stringify(payload, null, 2)}`);
}

function report(workflow: WorkflowModule, state: Record<string, unknown>): void {
  for (const nodeId of workflow.order) {
    const output = state[`${nodeId}__output`];
    if (output === undefined) continue;
    process.stdout.write(`\n=== ${nodeId} ===\n`);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }

  const artifacts = state.artifacts as Array<{ path: string; note: string }> | undefined;
  if (artifacts?.length) {
    process.stdout.write("\n=== files written ===\n");
    for (const artifact of artifacts) {
      process.stdout.write(`${artifact.path}${artifact.note ? ` — ${artifact.note}` : ""}\n`);
    }
  }
}

/**
 * Intent: resolves a workflow `target` (a slug or a direct path) to a
 * loadable module path. Re-transpiles when the TypeScript source is newer
 * than the compiled module, so hand-edits to a generated workflow take
 * effect without a regenerate.
 * Parameters: `target` is a slug naming a generated workflow, or a path
 * ending in `.ts`/`.mjs`/`.js`. Returns the resolved `modulePath` and the
 * `manifestProvider` to use when none is given explicitly; throws `J2Error`
 * if the target or its manifest's runtime cannot be found.
 * Honesty: dishonest — reads the filesystem (`existsSync`, `statSync`,
 * `readFileSync`) and may write a transpiled file via `transpileWorkflow`.
 * Idempotency: idempotent for a given mtime state; re-transpiling with
 * unchanged source produces the same compiled output.
 */
function resolveWorkflow(target: string): { modulePath: string; manifestProvider: string } {
  if (target.endsWith(".ts") || target.endsWith(".mjs") || target.endsWith(".js")) {
    const path = resolve(target);
    if (!existsSync(path)) throw new J2Error("not-found", `no such workflow file: ${path}`);
    if (!path.endsWith(".ts")) return { modulePath: path, manifestProvider: "anthropic" };
    const compiled = path.replace(/\.ts$/, ".mjs");
    transpileWorkflow(readFileSync(path, "utf-8"), path, compiled);
    return { modulePath: compiled, manifestProvider: "anthropic" };
  }

  const paths = workflowPaths(target);
  if (!existsSync(paths.source)) {
    throw new J2Error(
      "not-found",
      `no generated workflow named '${target}'`,
      "see what exists with: j2 list",
    );
  }

  const manifest = existsSync(paths.manifest) ? readManifest(paths.manifest) : undefined;
  if (manifest && !existsSync(manifest.runtime)) {
    throw new J2Error(
      "runtime",
      `this workflow was generated against a j2 runtime that no longer exists: ${manifest.runtime}`,
      `regenerate it with: j2 generate --dir ${manifest.source} --name ${target} --force`,
    );
  }

  const sourceNewer =
    !existsSync(paths.compiled) ||
    statSync(paths.source).mtimeMs > statSync(paths.compiled).mtimeMs;
  if (sourceNewer) {
    log.debug(`re-transpiling ${paths.source}`);
    transpileWorkflow(readFileSync(paths.source, "utf-8"), paths.source, paths.compiled);
    log.info(`re-transpiled ${paths.source} -> ${paths.compiled}`);
  }

  return { modulePath: paths.compiled, manifestProvider: manifest?.provider ?? "anthropic" };
}
