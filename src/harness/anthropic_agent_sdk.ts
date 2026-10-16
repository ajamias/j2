import { query } from "@anthropic-ai/claude-agent-sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { HarnessError } from "../util/errors.js";
import type { HarnessStrategy } from "./types.js";

/** Drives the model through Anthropic's own Claude Agent SDK instead of langchain. */
export const anthropicAgentSdkHarness: HarnessStrategy = {
  name: "anthropic-agent-sdk",
  supports: ["anthropic", "ollama", "openrouter"],

  async call({ provider, size, overrides, schema, system, user, label }) {
    const run = query({
      prompt: user,
      options: {
        model: provider.modelId(size, overrides),
        systemPrompt: system,
        outputFormat: { type: "json_schema", schema: zodToJsonSchema(schema) },
        permissionMode: "bypassPermissions",
      },
    });

    for await (const message of run) {
      if (message.type !== "result") continue;
      if (message.subtype !== "success") {
        throw new HarnessError("sdk-error", `${label}: claude agent sdk run failed (${message.subtype})`);
      }
      return message.structured_output;
    }

    return undefined;
  },
};
