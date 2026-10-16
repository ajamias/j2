import type { z } from "zod";
import type { HarnessName } from "./registry.js";
import type { ProviderName } from "../providers/registry.js";
import type { ModelOverrides, ModelSize, ProviderStrategy } from "../providers/types.js";

export interface HarnessRequest<TSchema extends z.ZodTypeAny> {
  harness: HarnessStrategy;
  provider: ProviderStrategy;
  size: ModelSize;
  overrides?: ModelOverrides;
  schema: TSchema;
  system: string;
  user: string;
  /** Short name used in logs and in the fixture table under J2_FAKE_MODEL. */
  label: string;
}

/**
 * One SDK used to drive a model call. A provider says *which model*; a
 * harness says *which library makes the call*. `supports` lets a harness
 * refuse to pair with a provider its SDK can't talk to.
 */
export interface HarnessStrategy {
  readonly name: HarnessName;
  readonly supports: readonly ProviderName[] | "any";
  /** Returns the schema-shaped value (or something close enough to `schema.parse`) straight from the SDK. */
  call<TSchema extends z.ZodTypeAny>(request: HarnessRequest<TSchema>): Promise<unknown>;
}
