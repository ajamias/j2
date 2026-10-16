import { ProviderError } from "../util/errors.js";
import { anthropicStrategy } from "./anthropic.js";
import { ollamaStrategy } from "./ollama.js";
import { openaiStrategy } from "./openai.js";
import { openrouterStrategy } from "./openrouter.js";
import { type ProviderStrategy } from "./types.js";

const providerNameSchema = ["anthropic", "openai", "openrouter", "ollama"] as const;
export type ProviderName = (typeof providerNameSchema)[number];

export const PROVIDER_NAMES = providerNameSchema;

/** The only place in the codebase that maps a provider name to behaviour. */
export const PROVIDERS: Record<ProviderName, ProviderStrategy> = {
  anthropic: anthropicStrategy,
  openai: openaiStrategy,
  openrouter: openrouterStrategy,
  ollama: ollamaStrategy,
};

export const DEFAULT_PROVIDER: ProviderName = "anthropic";

export function resolveProvider(name: ProviderName | undefined): ProviderStrategy {
  const provider = PROVIDERS[name ?? DEFAULT_PROVIDER];
  if (!provider) {
    throw new ProviderError("unknown-provider", `unknown provider '${name}'`, `expected one of: ${PROVIDER_NAMES.join(", ")}`);
  }
  return provider;
}
