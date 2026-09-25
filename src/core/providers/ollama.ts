/**
 * Ollama provider — local models via Ollama's OpenAI-compatible API.
 *
 * A thin config over the shared OpenAI-compatible base, pointed at Ollama's `/v1` endpoint.
 * No real API key is needed (a placeholder satisfies the client). Requires a running
 * Ollama server and a tool-capable model (e.g. llama3.1).
 *
 * Config: `OLLAMA_HOST` (default http://localhost:11434), `OLLAMA_MODEL` (default llama3.1),
 * model override via `opts.model` / `AGENT_MODEL`.
 */

import type { Provider } from "../provider.js";
import { makeOpenAICompatProvider } from "./openai_compat.js";

const host = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");

export const ollamaProvider: Provider = makeOpenAICompatProvider({
  name: "ollama",
  defaultModel: process.env.OLLAMA_MODEL || "llama3.1",
  baseURL: `${host}/v1`,
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
});
