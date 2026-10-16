import { ChatOpenRouter } from "@langchain/openrouter";
import { OPENROUTER_BASE_URL } from "../config/env.js";
import { defineProvider, type ModelSize } from "./types.js";

/**
 * OpenRouter ids are namespaced `vendor/model`. Verify against the catalogue
 * at https://openrouter.ai/models on each release.
 */
const DEFAULTS: Record<ModelSize, string> = {
  small: "anthropic/claude-haiku-5.5",
  medium: "anthropic/claude-sonnet-5.5",
  large: "anthropic/claude-opus-5.5",
};

export const openrouterStrategy = defineProvider({
  name: "openrouter",
  defaults: DEFAULTS,
  requiredEnv: ["OPENROUTER_API_KEY"],
  envHint: "export OPENROUTER_API_KEY=... or pick another provider with --provider",
  build: (model, { temperature, maxTokens }) =>
    new ChatOpenRouter({
      model,
      temperature,
      maxTokens,
      // Note the casing: ChatOpenRouter takes `baseURL`, ChatOllama takes `baseUrl`.
      baseURL: OPENROUTER_BASE_URL(),
      siteName: "j2",
    }),
});
