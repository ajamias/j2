import { tool } from "@langchain/core/tools";
import { spawn } from "node:child_process";
import { z } from "zod";
import { log } from "../../util/log.js";
import {
  assertCommandAllowed,
  containedPath,
  LIMITS,
  scrubbedEnv,
  truncate,
  type Workspace,
} from "./policy.js";

/**
 * Runs a command in the workspace.
 *
 * This tool is absent from the toolset unless `--allow-shell` is passed, and
 * when present it is wrapped in a per-call approval interrupt. The hardening
 * here is the last of the three gates, not the only one: `shell: false`, cwd
 * forced inside the workspace, a timeout, capped output, and an environment
 * with every credential removed.
 *
 * Honesty: dishonest — spawns an arbitrary child process in the workspace.
 * Idempotency: not idempotent; the command itself decides what side effects
 * it has.
 */
export function runCommandTool({ workspace }: { workspace: Workspace }) {
  return tool(
    async ({ command, args, cwd, timeoutMs }) => {
      assertCommandAllowed([command, ...(args ?? [])].join(" "));
      const workingDir = containedPath(workspace, cwd ?? ".");
      const timeout = Math.min(timeoutMs ?? LIMITS.commandTimeoutMs, LIMITS.commandTimeoutMs);

      log.debug(`spawning ${command} ${(args ?? []).join(" ")} in ${workingDir}`);
      return new Promise<string>((resolve) => {
        const child = spawn(command, args ?? [], {
          cwd: workingDir,
          shell: false,
          env: scrubbedEnv(),
          timeout,
        });

        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        child.on("error", (error) => {
          log.warn(`failed to spawn ${command}: ${error.message}`);
          resolve(`failed to start: ${error.message}`);
        });
        child.on("close", (code, signal) => {
          const status = signal ? `killed by ${signal}` : `exit ${code ?? 0}`;
          log.info(`${command} ${status}`);
          const body = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n--- stderr ---\n");
          resolve(truncate(`${status}\n${body || "(no output)"}`, LIMITS.commandOutputBytes));
        });
      });
    },
    {
      name: "run_command",
      description:
        "Run a single program in the workspace. There is no shell: pass the program in `command` and each argument separately in `args`. Credentials are stripped from the environment.",
      schema: z.object({
        command: z.string().describe("Program to run, e.g. 'git'. Not a shell line."),
        args: z.array(z.string()).optional().describe("Arguments, one per element, e.g. ['status', '--short']."),
        cwd: z.string().optional().describe("Working directory inside the workspace. Defaults to its root."),
        timeoutMs: z.number().int().min(1000).optional().describe("Kill the process after this long."),
      }),
    },
  );
}
