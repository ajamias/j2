/**
 * Anthropic provider — Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`).
 *
 * `run` drives the full Claude Code agent loop (Read / Edit / Bash / …) with the skill's
 * SKILL.md as the system prompt; `runJson` is a tool-free single-turn variant. The SDK's
 * `query()` is async, so these are plain async functions.
 */

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";

import type { JsonOpts, Provider, RunOpts, RunResult } from "../provider.js";
import { stripFences } from "../provider.js";

// Standard Claude Code toolset auto-approved for skill nodes.
export const DEFAULT_TOOLS = [
  "Read", "Write", "Edit", "Bash", "Glob", "Grep",
  "WebSearch", "WebFetch", "TodoWrite",
];
// Tools denied for tool-free decision calls (router, gates).
export const NO_TOOLS = [
  "Read", "Write", "Edit", "Bash", "Glob", "Grep",
  "WebSearch", "WebFetch", "TodoWrite",
];

async function queryText(
  prompt: string,
  options: Options,
): Promise<{ text: string; cost: number | null }> {
  const parts: string[] = [];
  let final: string | null = null;
  let cost: number | null = null;
  for await (const message of query({ prompt, options })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") parts.push(block.text);
      }
    } else if (message.type === "result") {
      cost = message.total_cost_usd;
      if (message.subtype === "success") final = message.result;
    }
  }
  return { text: final ?? parts.join("\n"), cost };
}

async function run(prompt: string, opts: RunOpts = {}): Promise<RunResult> {
  const options: Options = {
    permissionMode: opts.permissionMode ?? "acceptEdits",
    allowedTools: opts.allowedTools ?? DEFAULT_TOOLS,
    disallowedTools: opts.disallowedTools ?? [],
    settingSources: [], // ignore filesystem CLAUDE.md/settings for deterministic runs
  };
  if (opts.system) options.systemPrompt = opts.system;
  if (opts.cwd) options.cwd = opts.cwd;
  if (opts.model) options.model = opts.model;
  if (opts.maxTurns != null) options.maxTurns = opts.maxTurns;

  const { text, cost } = await queryText(prompt, options);
  return { text, costUsd: cost };
}

async function runJson(prompt: string, opts: JsonOpts = {}): Promise<Record<string, unknown>> {
  const res = await run(prompt, {
    system: opts.system,
    permissionMode: "default",
    allowedTools: [],
    disallowedTools: NO_TOOLS,
    model: opts.model,
    maxTurns: 1,
  });
  return JSON.parse(stripFences(res.text));
}

export const anthropicProvider: Provider = { name: "anthropic", run, runJson };
