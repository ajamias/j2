/**
 * OpenAI provider — OpenAI Agents SDK (`@openai/agents`) over the OpenAI API.
 *
 * A thin config over the shared OpenAI-compatible base. Auth: `OPENAI_API_KEY`.
 * Model: `opts.model` -> `OPENAI_MODEL` -> a sensible default.
 */

import type { Provider } from "../provider.js";
import { makeOpenAICompatProvider } from "./openai_compat.js";

export const openaiProvider: Provider = makeOpenAICompatProvider({
  name: "openai",
  defaultModel: process.env.OPENAI_MODEL || "gpt-5.5",
});
