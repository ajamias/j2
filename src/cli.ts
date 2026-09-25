/**
 * Run the skills agent from the CLI.
 *
 * Answers human-in-the-loop interrupts (clarify questions, final review) from the terminal.
 */

import { parseArgs } from "node:util";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { Command, MemorySaver } from "@langchain/langgraph";

import { buildGraph } from "./graph.js";
import { defaultContext } from "./core/node.js";
import { resolveProvider } from "./core/provider.js";
import type { AgentStateType } from "./state.js";

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      workdir: { type: "string", default: process.cwd() },
      provider: { type: "string", default: process.env.AGENT_PROVIDER ?? "anthropic" },
      "permission-mode": { type: "string", default: "acceptEdits" },
      model: { type: "string" },
      "recursion-limit": { type: "string", default: "100" },
    },
  });

  const task = positionals[0];
  if (!task) {
    console.error('Usage: skills-agent "<task>" [--provider anthropic|openai|ollama|openrouter] [--workdir DIR] [--permission-mode MODE] [--model M] [--recursion-limit N]');
    process.exit(1);
  }

  const app = buildGraph(
    defaultContext({
      provider: resolveProvider(values.provider as string),
      permissionMode: values["permission-mode"] as PermissionMode,
      model: values.model ?? null,
    }),
    { checkpointer: new MemorySaver() },
  );

  const config = {
    configurable: { thread_id: "cli" },
    recursionLimit: Number(values["recursion-limit"]),
  };
  const init: Partial<AgentStateType> = {
    task,
    workdir: values.workdir as string,
    context: [],
    history: [],
    log: [],
    steps: 0,
  };

  const rl = readline.createInterface({ input, output });
  try {
    type Result = AgentStateType & { __interrupt__?: Array<{ value: unknown }> };
    let result = (await app.invoke(init, config)) as Result;
    while (result.__interrupt__) {
      const payload = result.__interrupt__[0].value as { question?: string } | string;
      const question = typeof payload === "string" ? payload : payload.question ?? JSON.stringify(payload);
      const answer = await rl.question(`\n[human] ${question}\n> `);
      result = (await app.invoke(new Command({ resume: answer }), config)) as Result;
    }

    console.log("\n=== RUN TRACE ===");
    for (const line of (result.log ?? []) as string[]) console.log(line);
    console.log("\n=== SKILLS RUN ===");
    for (const h of result.history ?? []) console.log(`- ${h.skill}: ${h.summary}`);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
