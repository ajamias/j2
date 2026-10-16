import { OpenRouter, tool } from "@openrouter/agent";
import { requireEnv } from "../config/env.js";
import { HarnessError } from "../util/errors.js";
import type { HarnessStrategy } from "./types.js";

/**
 * Drives the model through OpenRouter's own agent SDK. It has no top-level
 * "structured output" call, so extraction goes through its tool-calling
 * loop: a single tool whose `inputSchema` is the target schema, with the
 * tool's own arguments serving as the extracted value.
 */
export const openrouterAgentSdkHarness: HarnessStrategy = {
  name: "openrouter-agent-sdk",
  supports: ["openrouter"],

  async call({ provider, size, overrides, schema, system, user, label }) {
    requireEnv(provider.requiredEnv, "the openrouter-agent-sdk harness", "export OPENROUTER_API_KEY=...");

    const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
    let captured: unknown;

    const extract = tool({
      name: "extract",
      description: "Record the extracted result. Always call this exactly once with the full result.",
      inputSchema: schema,
      execute: async (input: unknown) => {
        captured = input;
        return "recorded";
      },
    });

    await openrouter
      .callModel({
        model: provider.modelId(size, overrides),
        input: `${system}\n\n${user}`,
        tools: [extract],
      })
      .getText();

    if (captured === undefined) {
      throw new HarnessError("empty-response", `${label}: openrouter agent sdk never called the extract tool`);
    }
    return captured;
  },
};
