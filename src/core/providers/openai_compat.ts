/**
 * Shared base for OpenAI-compatible providers (OpenAI, Ollama, and any other endpoint
 * that speaks the OpenAI API).
 *
 * The OpenAI Agents SDK has no built-in filesystem/shell tools (unlike the Claude Agent
 * SDK), so `run` gives the agent an equivalent coding toolset defined here
 * (read/write/edit/bash) scoped to the working directory. `runJson` runs tool-free and
 * returns one JSON object. `permissionMode` has no effect — function tools always execute.
 *
 * A concrete provider is a thin config over `makeOpenAICompatProvider`: pass a name, a
 * default model, and (for non-OpenAI endpoints like Ollama) a `baseURL` + `apiKey`.
 */

import { exec } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { Agent, OpenAIProvider, Runner, tool } from "@openai/agents";
import { z } from "zod";

import type { JsonOpts, Provider, RunOpts, RunResult } from "../provider.js";
import { stripFences } from "../provider.js";

const execAsync = promisify(exec);
const CLIP = 20000; // cap tool output so a big file/command doesn't blow the context

export interface OpenAICompatConfig {
  /** Provider name (e.g. "openai", "ollama"). */
  name: string;
  /** Model used when a run doesn't specify one. */
  defaultModel: string;
  /** Custom OpenAI-compatible endpoint (e.g. Ollama's /v1). Omit for the OpenAI API. */
  baseURL?: string;
  /** API key for the endpoint (a placeholder is fine for local endpoints like Ollama). */
  apiKey?: string;
}

/** Coding tools scoped to `cwd`, mirroring the Claude Code toolset. */
function codingTools(cwd: string) {
  const resolve = (p: string) => path.resolve(cwd, p);
  return [
    tool({
      name: "read_file",
      description: "Read a UTF-8 text file, relative to the working directory.",
      parameters: z.object({ path: z.string() }),
      async execute({ path: p }) {
        try {
          return (await readFile(resolve(p), "utf8")).slice(0, CLIP);
        } catch (e) {
          return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
        }
      },
    }),
    tool({
      name: "write_file",
      description: "Create or overwrite a UTF-8 text file, relative to the working directory.",
      parameters: z.object({ path: z.string(), content: z.string() }),
      async execute({ path: p, content }) {
        try {
          await mkdir(path.dirname(resolve(p)), { recursive: true });
          await writeFile(resolve(p), content, "utf8");
          return "ok";
        } catch (e) {
          return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
        }
      },
    }),
    tool({
      name: "edit_file",
      description: "Replace the first occurrence of oldText with newText in a file.",
      parameters: z.object({ path: z.string(), oldText: z.string(), newText: z.string() }),
      async execute({ path: p, oldText, newText }) {
        try {
          const cur = await readFile(resolve(p), "utf8");
          if (!cur.includes(oldText)) return "ERROR: oldText not found";
          await writeFile(resolve(p), cur.replace(oldText, newText), "utf8");
          return "ok";
        } catch (e) {
          return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
        }
      },
    }),
    tool({
      name: "bash",
      description: "Run a shell command in the working directory (use for grep, glob, git, tests).",
      parameters: z.object({ command: z.string() }),
      async execute({ command }) {
        try {
          const { stdout, stderr } = await execAsync(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
          return (stdout + stderr).slice(0, CLIP) || "(no output)";
        } catch (e) {
          const err = e as { stderr?: string; message?: string };
          return `ERROR: ${(err.stderr || err.message || String(e)).slice(0, CLIP)}`;
        }
      },
    }),
  ];
}

function finalText(output: unknown): string {
  return typeof output === "string" ? output : JSON.stringify(output ?? "");
}

export function makeOpenAICompatProvider(cfg: OpenAICompatConfig): Provider {
  // A custom endpoint (Ollama, etc.) needs its own OpenAI-compatible provider over the
  // Chat Completions API; the plain OpenAI case uses the SDK's default (Responses API).
  const custom = cfg.baseURL != null || cfg.apiKey != null;
  const runner = custom
    ? new Runner({
        modelProvider: new OpenAIProvider({
          baseURL: cfg.baseURL,
          apiKey: cfg.apiKey,
          useResponses: false,
        }),
        tracingDisabled: true, // no OpenAI key/tracing endpoint for local/compat providers
      })
    : new Runner();

  async function run(prompt: string, opts: RunOpts = {}): Promise<RunResult> {
    const cwd = opts.cwd || process.cwd();
    const toolFree = Array.isArray(opts.allowedTools) && opts.allowedTools.length === 0;
    const agent = new Agent({
      name: "skill-node",
      instructions: opts.system || "You are a software engineering agent.",
      model: opts.model || cfg.defaultModel,
      tools: toolFree ? [] : codingTools(cwd),
    });
    const result = await runner.run(agent, prompt, { maxTurns: opts.maxTurns ?? 50 });
    return { text: finalText(result.finalOutput), costUsd: null };
  }

  async function runJson(prompt: string, opts: JsonOpts = {}): Promise<Record<string, unknown>> {
    const res = await run(prompt, {
      system: opts.system,
      model: opts.model,
      allowedTools: [],
      maxTurns: 1,
    });
    return JSON.parse(stripFences(res.text));
  }

  return { name: cfg.name, run, runJson };
}
