import { Command, Option } from "commander";
import { logger, LOG_LEVEL_DEFAULT, LOG_LEVEL_DEBUG } from "../util/log.js";
import { J2_VERSION } from "../version.js";
import { runGenerate, GenerateOptions } from "./generate.js";

const PROVIDER_NAMES = ["anthropic", "openai"] as const;
const HARNESS_NAMES = ["langchain"] as const;

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
      new Option("--provider <provider>", "LLM provider").choices(PROVIDER_NAMES),
    )
    .addOption(
      new Option("--harness <harness>", "SDK used to drive the model call").choices(HARNESS_NAMES),
    )
    .option("-m, --model <id>", "pin every model size to one id")
    .option("--small-model <id>", "override the model used for extraction")
    .option("--medium-model <id>", "override the model used for workflow design")
    .option("--large-model <id>", "override the model used for node agent loops")
    .option("--decision-model <id>", "add a system one model for routing decisions")
    .option("--temperature <value>", "sampling temperature", number)
    .option("--max-tokens <value>", "maximum output tokens per call", integer)
    .option("-v, --verbose", "shorthand for --log-level debug");
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
      .option("--dry-run", "print the workflow spec instead of writing files", false)
  ).action(async (options) => {
    logger.setLogLevel(options.verbose ? LOG_LEVEL_DEBUG : LOG_LEVEL_DEFAULT);
    const generateOptions: GenerateOptions = {
      skillDir: options.directory,
      name: options.name,
      llm: options.model,
      systemOneModel: options.decisionModel,
      provider: options.provider,
      harness: options.harness,
      force: options.force,
      dryRun: options.dryRun,
    };

    await runGenerate(generateOptions);
  });

  program
    .command("list")
    .description("list generated workflows")
    .action(() => {
      // runList();
    });

  return program;
}
