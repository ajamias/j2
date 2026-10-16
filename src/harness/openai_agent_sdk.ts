import { Agent, run } from "@openai/agents";
import { HarnessError } from "../util/errors.js";
import type { HarnessStrategy } from "./types.js";

/** Drives the model through OpenAI's own Agents SDK instead of langchain. */
export const openaiAgentSdkHarness: HarnessStrategy = {
  name: "openai-agent-sdk",
  supports: ["openai", "ollama", "openrouter"],

  async call({ provider, size, overrides, schema, system, user, label }) {
    const agent = new Agent({
      name: label,
      instructions: system,
      model: provider.modelId(size, overrides),
      // The SDK's types want a `ZodObject`; callers of this harness always pass
      // one, but the generic `z.ZodTypeAny` on `HarnessStrategy.call` is wider.
      outputType: schema as unknown as ConstructorParameters<typeof Agent>[0]["outputType"],
      modelSettings: { temperature: overrides?.temperature, maxTokens: overrides?.maxTokens },
    });

    const result = await run(agent, user);
    if (result.finalOutput === undefined) {
      throw new HarnessError("empty-response", `${label}: openai agents sdk run produced no final output`);
    }
    return result.finalOutput;
  },
};
