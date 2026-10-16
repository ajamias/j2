import { ChatOpenAI } from "@langchain/openai";
import { defineProvider, type ModelSize } from "./types.js";

/** Verify against the current model lineup on each release. */
const DEFAULTS: Record<ModelSize, string> = {
  small: "gpt-5.4-nano",
  medium: "gpt-5.4-mini",
  large: "gpt-5.5",
};

export const openaiStrategy = defineProvider({
  name: "openai",
  defaults: DEFAULTS,
  requiredEnv: ["OPENAI_API_KEY"],
  envHint: "export OPENAI_API_KEY=... or pick another provider with --provider",
  build: (model, { temperature, maxTokens }) => new ChatOpenAI({ model, temperature, maxTokens }),
});
