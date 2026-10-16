import { ChatAnthropic } from "@langchain/anthropic";
import { defineProvider, type ModelSize } from "./types.js";

/** Verify against the current model lineup on each release. */
const DEFAULTS: Record<ModelSize, string> = {
  small: "claude-haiku-5-5",
  medium: "claude-sonnet-5-5",
  large: "claude-opus-5-5",
};

export const anthropicStrategy = defineProvider({
  name: "anthropic",
  defaults: DEFAULTS,
  requiredEnv: ["ANTHROPIC_API_KEY"],
  envHint: "export ANTHROPIC_API_KEY=... or pick another provider with --provider",
  build: (model, { temperature, maxTokens }) => new ChatAnthropic({ model, temperature, maxTokens }),
});
