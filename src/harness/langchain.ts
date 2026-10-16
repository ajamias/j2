import type { HarnessStrategy } from "./types.js";

/**
 * Fallback harness: any provider already exposes a langchain `BaseChatModel`
 * via `provider.chat()`, and every langchain chat model implements
 * `withStructuredOutput`, so this harness works with providers that have no
 * dedicated agent SDK of their own (ollama today).
 */
export const langchainHarness: HarnessStrategy = {
  name: "langchain",
  supports: "any",

  async call({ provider, size, overrides, schema, system, user }) {
    const model = provider.chat(size, overrides);
    const structured = model.withStructuredOutput(schema);
    return structured.invoke([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
  },
};
