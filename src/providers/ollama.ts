import { ChatOllama } from "@langchain/ollama";
import { OLLAMA_BASE_URL } from "../config/env.js";
import { J2Error } from "../util/errors.js";
import { log } from "../util/log.js";
import { defineProvider, type ModelSize } from "./types.js";

/**
 * Every model here must support tool calling — the whole pipeline runs on
 * structured output. Verify with `ollama show <model>` before changing.
 */
const DEFAULTS: Record<ModelSize, string> = {
  small: "qwen3.5:4b",
  medium: "qwen3.5:14b",
  large: "qwen3.5:32b",
};

export const ollamaStrategy = defineProvider({
  name: "ollama",
  defaults: DEFAULTS,

  build: (model, { temperature, maxTokens }) =>
    new ChatOllama({
      model,
      temperature,
      // ChatOllama has no `maxTokens`; the equivalent knob is `numPredict`.
      numPredict: maxTokens,
      baseUrl: OLLAMA_BASE_URL(),
    }),

  /**
   * Ollama needs no API key, but it does need to be running and to have the
   * models pulled. Checking here turns a mid-run multi-gigabyte surprise
   * download into an up-front message.
   */
  async preflight(modelId) {
    const base = OLLAMA_BASE_URL();
    let tags: { models?: Array<{ name?: string }> };
    try {
      const response = await fetch(`${base}/api/tags`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      tags = (await response.json()) as typeof tags;
    } catch (error) {
      throw new J2Error(
        "config",
        `cannot reach the ollama server at ${base}: ${error instanceof Error ? error.message : String(error)}`,
        "start it with `ollama serve`, or set OLLAMA_BASE_URL",
      );
    }

    const pulled = new Set((tags.models ?? []).map((m) => m.name).filter(Boolean) as string[]);
    for (const size of ["small", "medium", "large"] as const) {
      const model = modelId(size);
      if (!pulled.has(model)) {
        log.warn(`ollama ${size} model '${model}' is not pulled — run \`ollama pull ${model}\``);
      }
    }
  },
});
