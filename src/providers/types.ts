import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { requireEnv } from "../config/env.js";
import { ProviderName } from "./registry.js";

/**
 * Logical model sizes. Pipeline stages ask for a size, never a model id, so a
 * provider swap never touches a call site.
 *
 * - `small`  — mechanical, schema-constrained extraction (one call per skill).
 * - `medium` — design-time reasoning during `generate`: classifying the skill
 *              set, ordering it, designing each node's context schema.
 * - `large`  — the run-time agent loops of `run`, where real work happens.
 */
export const modelSizeSchema = z.enum(["small", "medium", "large"]);
export type ModelSize = z.infer<typeof modelSizeSchema>;

export interface ModelOverrides {
  /** `--model`: pins every size to one id. */
  all?: string;
  /** `--small-model` / `--medium-model` / `--large-model`. */
  bySize?: Partial<Record<ModelSize, string>>;
  temperature?: number;
  maxTokens?: number;
}

/**
 * The strategy interface. Every pipeline stage depends on this and nothing
 * else, so there is exactly one `switch` on provider name in the codebase
 * (in `registry.ts`).
 */
export interface ProviderStrategy {
  readonly name: ProviderName;
  /** Size to model id. The single source of truth for this provider. */
  readonly defaults: Readonly<Record<ModelSize, string>>;
  /** Environment variables this provider cannot run without. */
  readonly requiredEnv: readonly string[];
  /** Fails fast with an actionable hint before any real work is done. */
  preflight(overrides?: ModelOverrides): Promise<void>;
  /** Pure: resolve a size to a concrete model id, applying override precedence. */
  modelId(size: ModelSize, overrides?: ModelOverrides): string;
  /** Build (or reuse) a chat model for a logical size. */
  chat(size: ModelSize, overrides?: ModelOverrides): BaseChatModel;
}

/**
 * Override precedence, highest first:
 *   1. `--<size>-model`
 *   2. `--model` (pins all sizes)
 *   3. `J2_<PROVIDER>_<SIZE>_MODEL`
 *   4. the provider's default for that size
 */
export function resolveModelId(
  provider: ProviderName,
  defaults: Readonly<Record<ModelSize, string>>,
  size: ModelSize,
  overrides: ModelOverrides = {},
): string {
  const bySize = overrides.bySize?.[size];
  if (bySize) return bySize;
  if (overrides.all) return overrides.all;
  const env = process.env[`J2_${provider.toUpperCase()}_${size.toUpperCase()}_MODEL`];
  if (env && env.trim()) return env.trim();
  return defaults[size];
}

export interface ProviderSpec {
  name: ProviderName;
  defaults: Readonly<Record<ModelSize, string>>;
  requiredEnv?: readonly string[];
  /** Shown when a required variable is missing, so the fix is one copy-paste. */
  envHint?: string;
  /** Construct the provider's chat model. Called once per distinct model id. */
  build: (modelId: string, overrides: ModelOverrides) => BaseChatModel;
  /** Replaces the default env-var check. `modelId` resolves overrides for you. */
  preflight?: (modelId: (size: ModelSize) => string) => Promise<void>;
}

/**
 * Builds a strategy from the parts that actually differ between providers.
 *
 * Size resolution, the model cache, and the default env check are identical
 * everywhere, so each provider file is left stating only its model table, its
 * constructor call, and whatever is genuinely peculiar to it.
 */
export function defineProvider(spec: ProviderSpec): ProviderStrategy {
  // `generate` asks for the same model once per skill; without this cache each
  // ask would build a fresh HTTP client.
  const cache = new Map<string, BaseChatModel>();
  const requiredEnv = spec.requiredEnv ?? [];

  const modelId = (size: ModelSize, overrides?: ModelOverrides): string =>
    resolveModelId(spec.name, spec.defaults, size, overrides);

  return {
    name: spec.name,
    defaults: spec.defaults,
    requiredEnv,

    async preflight(overrides: ModelOverrides = {}) {
      if (spec.preflight) return spec.preflight((size) => modelId(size, overrides));
      requireEnv(
        requiredEnv,
        `the ${spec.name} provider`,
        spec.envHint ?? "set it, or pick another provider with --provider",
      );
    },

    modelId,

    chat(size: ModelSize, overrides: ModelOverrides = {}) {
      const id = modelId(size, overrides);
      const key = `${id}|${overrides.temperature ?? ""}|${overrides.maxTokens ?? ""}`;
      let model = cache.get(key);
      if (!model) {
        model = spec.build(id, overrides);
        cache.set(key, model);
      }
      return model;
    },
  };
}
