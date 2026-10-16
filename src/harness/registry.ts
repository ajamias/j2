import type { z } from "zod";
import { log } from "../util/log.js";
import { HarnessError } from "../util/errors.js";
import { loadFixture } from "./fixture.js";
import { anthropicAgentSdkHarness } from "./anthropic_agent_sdk.js";
import { langchainHarness } from "./langchain.js";
import { openaiAgentSdkHarness } from "./openai_agent_sdk.js";
import { openrouterAgentSdkHarness } from "./openrouter_agent_sdk.js";
import { type HarnessRequest, type HarnessStrategy } from "./types.js";

const harnessNameSchema = ["langchain", "anthropic-agent-sdk", "openai-agent-sdk", "openrouter-agent-sdk"] as const;
export type HarnessName = (typeof harnessNameSchema)[number];

export const HARNESS_NAMES = harnessNameSchema;

export const HARNESSES: Record<HarnessName, HarnessStrategy> = {
  langchain: langchainHarness,
  "anthropic-agent-sdk": anthropicAgentSdkHarness,
  "openai-agent-sdk": openaiAgentSdkHarness,
  "openrouter-agent-sdk": openrouterAgentSdkHarness,
};

export const DEFAULT_HARNESS: HarnessName = "langchain";

export function resolveHarness(name: HarnessName | undefined, providerName: string): HarnessStrategy {
  const harness = HARNESSES[name ?? DEFAULT_HARNESS];
  if (!harness) {
    throw new HarnessError("unknown-harness", `unknown harness '${name}'`, `expected one of: ${HARNESS_NAMES.join(", ")}`);
  }
  if (harness.supports !== "any" && !harness.supports.includes(providerName as never)) {
    throw new HarnessError(
      "incompatible-provider",
      `harness '${harness.name}' does not support provider '${providerName}'`,
      `pick a provider in [${harness.supports.join(", ")}], or use --harness langchain`,
    );
  }
  return harness;
}

// One schema-constrained model call, routed through whichever harness was picked.
export async function structuredCall<TSchema extends z.ZodTypeAny>(
  request: HarnessRequest<TSchema>,
): Promise<z.infer<TSchema>> {
  const fixture = await loadFixture(request.label, request.schema);
  if (fixture !== undefined) return fixture;

  log.debug(`${request.label}: calling model via ${request.harness.name} harness`);
  const raw = await request.harness.call(request);
  if (raw === undefined || raw === null) {
    throw new HarnessError(
      "empty-response",
      `${request.label}: the ${request.harness.name} harness returned no structured response`,
      "the model may not support structured output on this harness — try --harness langchain",
    );
  }
  log.info(`${request.label}: received structured response`);

  return request.schema.parse(raw) as z.infer<TSchema>;
}
