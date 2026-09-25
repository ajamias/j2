/**
 * Agent-provider interface.
 *
 * A provider abstracts "run an agent turn": `run` drives a full agentic loop with a
 * coding toolset; `runJson` is a tool-free single-turn call that returns one JSON object.
 * The concrete providers are Anthropic (Claude Agent SDK) and OpenAI (OpenAI Agents SDK).
 * A provider is chosen at invoke time and threaded to every node via `NodeContext`.
 */

import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { setTracingDisabled } from "@openai/agents";

import { log } from "./logging.js";

export interface RunOpts {
  system?: string | null;
  cwd?: string | null;
  /** Anthropic permission mode; ignored by providers without a permission gate. */
  permissionMode?: PermissionMode;
  /** Pass `[]` to run tool-free; omit/null to use the provider's default toolset. */
  allowedTools?: string[] | null;
  disallowedTools?: string[] | null;
  model?: string | null;
  maxTurns?: number | null;
  outputSchema?: object | null;
}

export interface RunResult {
  text: string;
  costUsd: number | null;
}

export interface JsonOpts {
  system?: string | null;
  model?: string | null;
}

export interface Provider {
  readonly name: string;
  run(prompt: string, opts?: RunOpts): Promise<RunResult>;
  runJson(prompt: string, opts?: JsonOpts): Promise<Record<string, unknown>>;
}

export type ProviderName = "anthropic" | "openai" | "ollama" | "openrouter";

/** Strip a leading/trailing ```-fence so JSON replies parse cleanly. Shared by providers. */
export function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.slice(t.indexOf("\n") + 1); // drop opening ```lang line
    const close = t.lastIndexOf("```");
    if (close !== -1) t = t.slice(0, close); // drop closing fence
  }
  return t.trim();
}

// Import after the shared exports so the impls can import back the types/helper above.
import { anthropicProvider } from "./providers/anthropic.js";
import { openaiProvider } from "./providers/openai.js";
import { ollamaProvider } from "./providers/ollama.js";
import { openrouterProvider } from "./providers/openrouter.js";

function clip(text: string, max = 4000): string {
  return text.length > max ? `${text.slice(0, max)}… (+${text.length - max} chars)` : text;
}

/** Wrap a provider so every LLM call debug-logs the context (prompt + system) sent. */
function logProvider(inner: Provider): Provider {
  return {
    name: inner.name,
    async run(prompt, opts = {}) {
      log.debug(`[${inner.name}.run] system (${(opts.system ?? "").length} chars):\n${clip(opts.system ?? "(none)", 800)}`);
      log.debug(`[${inner.name}.run] prompt:\n${clip(prompt)}`);
      const res = await inner.run(prompt, opts);
      log.debug(`[${inner.name}.run] result (${res.text.length} chars)`);
      return res;
    },
    async runJson(prompt, opts = {}) {
      log.debug(`[${inner.name}.runJson] system (${(opts.system ?? "").length} chars):\n${clip(opts.system ?? "(none)", 800)}`);
      log.debug(`[${inner.name}.runJson] prompt:\n${clip(prompt)}`);
      return inner.runJson(prompt, opts);
    },
  };
}

/** Resolve a provider by name (default: anthropic). Throws on an unknown name. */
export function resolveProvider(name?: string | null): Provider {
  return logProvider(pickProvider(name));
}

function pickProvider(name?: string | null): Provider {
  switch ((name ?? "anthropic").toLowerCase()) {
    case "anthropic":
      return anthropicProvider;
    case "openai":
      return openaiProvider;
    case "ollama":
      setTracingDisabled(true); // Ollama doesn't support tracing; disable it globally.
      return ollamaProvider;
    case "openrouter":
      setTracingDisabled(true); // OpenRouter doesn't support tracing; disable it globally.
      return openrouterProvider;
    default:
      throw new Error(
        `unknown provider '${name}' (expected: anthropic | openai | ollama | openrouter)`,
      );
  }
}

export const defaultProvider: Provider = anthropicProvider;
