import { Command, Option } from "commander";
import { HARNESS_NAMES } from "../harness/registry.js";
import { PROVIDER_NAMES } from "../providers/registry.js";
import type { ModelOverrides, ModelSize } from "../providers/types.js";
import { setLogLevel, type LogLevel } from "../util/log.js";
import { J2_VERSION } from "../version.js";
import { runGenerate } from "./generate.js";
import { runList } from "./list.js";
import { runRun } from "./run.js";

interface SharedOptions {
  provider?: string;
  harness?: string;
  model?: string;
  smallModel?: string;
  mediumModel?: string;
  largeModel?: string;
  temperature?: number;
  maxTokens?: number;
  logLevel?: string;
  verbose?: boolean;
}

function number(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`expected a number, got '${value}'`);
  return parsed;
}

function integer(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) throw new Error(`expected an integer, got '${value}'`);
  return parsed;
}

/** Options every command shares: which models to use, and how loud to be. */
function withShared(command: Command): Command {
  return command
    .addOption(
      new Option("-p, --provider <provider>", "LLM provider").choices(PROVIDER_NAMES),
    )
    .addOption(
      new Option("--harness <harness>", "SDK used to drive the model call").choices(HARNESS_NAMES),
    )
    .option("-m, --model <id>", "pin every model size to one id")
    .option("--small-model <id>", "override the model used for extraction")
    .option("--medium-model <id>", "override the model used for workflow design")
    .option("--large-model <id>", "override the model used for node agent loops")
    .option("--temperature <value>", "sampling temperature", number)
    .option("--max-tokens <value>", "maximum output tokens per call", integer)
    .addOption(
      new Option("--log-level <level>", "logging verbosity").choices([
        "debug",
        "info",
        "warn",
        "error",
        "silent",
      ]),
    )
    .option("-v, --verbose", "shorthand for --log-level debug");
}

function applyShared(options: SharedOptions): ModelOverrides {
  setLogLevel((options.verbose ? "debug" : (options.logLevel as LogLevel)) ?? "info");

  const bySize: Partial<Record<ModelSize, string>> = {};
  if (options.smallModel) bySize.small = options.smallModel;
  if (options.mediumModel) bySize.medium = options.mediumModel;
  if (options.largeModel) bySize.large = options.largeModel;

  return {
    all: options.model,
    bySize,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  };
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("j2")
    .description("Compile a directory of agent skills into a runnable LangGraph workflow")
    .version(J2_VERSION);

  withShared(
    program
      .command("generate")
      .description("compile a skill directory into a TypeScript workflow")
      .option("-d, --directory <directory>", "directory containing skill subdirectories", process.cwd())
      .option("-n, --name <slug>", "name for the generated workflow")
      .option("-f, --force", "overwrite an existing workflow of the same name", false)
      .option("--check", "type-check the generated file before accepting it", false)
      .option("--allow-shell", "let skill nodes run commands (approved per call at run time)", false)
      .option(
        "--deny-tool <name>",
        "deny a built-in tool to every node (repeatable)",
        (value: string, previous: string[]) => [...previous, value],
        [] as string[],
      )
      .option("--dry-run", "print the workflow spec instead of writing files", false),
  ).action(async (options) => {
    const overrides = applyShared(options);
    await runGenerate({
      skillDir: options.directory,
      provider: options.provider ?? "anthropic",
      harness: options.harness,
      overrides,
      name: options.name,
      force: options.force,
      check: options.check,
      allowShell: options.allowShell,
      denyTool: options.denyTool,
      dryRun: options.dryRun,
    });
  });

  program
    .command("list")
    .description("list generated workflows")
    .action(() => {
      runList();
    });

  withShared(
    program
      .command("run")
      .description("run a generated workflow")
      .argument("<workflow>", "workflow name from `j2 list`, or a path to a generated file")
      .requiredOption("-g, --goal <task>", "what the workflow should accomplish")
      .option("-w, --workdir <directory>", "workspace the nodes may read and write", process.cwd())
      .option("-t, --thread <id>", "thread id, so a run can be identified in logs")
      .option("--recursion-limit <n>", "maximum graph steps", integer, 150)
      .option("-y, --yes", "auto-approve command execution (container use only)", false),
  ).action(async (workflow: string, options) => {
    const overrides = applyShared(options);
    await runRun({
      workflow,
      goal: options.goal,
      workdir: options.workdir,
      provider: options.provider,
      overrides,
      thread: options.thread,
      recursionLimit: options.recursionLimit,
      yes: options.yes,
    });
  });

  return program;
}
