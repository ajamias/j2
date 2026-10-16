import { HarnessStrategy } from "../harness/types.js";
import { ProviderStrategy } from "../providers/types.js";
import { Skill } from "../skills/schema.js";

export function generateExecutionFlow(
  skills: Skill[],
  provider: ProviderStrategy,
  harness: HarnessStrategy,
): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const skill of skills) {
  }

  return graph;
}