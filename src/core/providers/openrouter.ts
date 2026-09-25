/**
 * OpenRouter provider — many hosted models via OpenRouter's OpenAI-compatible API.
 *
 * A thin config over the shared OpenAI-compatible base, pointed at OpenRouter's `/v1`.
 * Requires `OPENROUTER_API_KEY`. Models are namespaced `vendor/model`
 * (e.g. `anthropic/claude-3.5-sonnet`, `openai/gpt-4o-mini`); pick one that supports
 * tool calling for the agentic nodes.
 *
 * Config: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default openai/gpt-4o-mini),
 * `OPENROUTER_BASE_URL` (default https://openrouter.ai/api/v1); override the model per
 * run via `opts.model` / `AGENT_MODEL`.
 */

import type { Provider } from "../provider.js";
import { makeOpenAICompatProvider } from "./openai_compat.js";

export const openrouterProvider: Provider = makeOpenAICompatProvider({
  name: "openrouter",
  defaultModel: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
  baseURL: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
  apiKey: process.env.OPENROUTER_API_KEY || "",
});
