import { z } from "zod";
import type { ModelOverrides, ProviderStrategy } from "../providers/types.js";
import type { IngestedSkill } from "../skills/schema.js";
import { log } from "../util/log.js";
import { structuredCall } from "../util/structured.js";

export const classificationSchema = z.object({
  setKind: z
    .string()
    .describe("What kind of collection this is, as a short noun phrase. E.g. 'software lifecycle phase skills', 'research and writing skills'."),
  title: z
    .string()
    .describe("A short human title for the workflow these skills form. Three to six words."),
  description: z
    .string()
    .describe("One sentence describing what running this workflow end to end accomplishes."),
  order: z
    .array(z.string())
    .min(1)
    .describe("Every skill slug exactly once, in the order they should run. Earlier skills produce what later ones consume."),
  rationale: z
    .string()
    .describe("Two or three sentences justifying this ordering."),
});
export type Classification = z.infer<typeof classificationSchema>;

const SYSTEM = [
  "You are designing a sequential workflow from a set of agent skills.",
  "First decide what kind of set this is, then order the skills so that each one's output feeds the ones after it.",
  "Prefer the order the skills themselves imply: a skill that says it runs 'before any plan or code exists' comes early;",
  "a skill that reviews or ships comes late. Cross-references between skills are strong ordering evidence.",
  "Every skill must appear exactly once.",
].join(" ");

/**
 * Intent: asks the model to classify a set of ingested skills and propose the
 * order they should run in as a sequential workflow.
 * Parameters: `skills` is the full ingested set; `options.provider` selects
 * the model backend, `options.overrides` tunes it. Returns a `Classification`
 * whose `order` is reconciled against the real skill slugs.
 * Honesty: dishonest — makes a network call to a model provider via
 * `structuredCall`.
 * Idempotency: not idempotent; repeated calls may return different orderings
 * from the model, though `reconcileOrder` always yields a valid permutation.
 */
export async function classifySkills(
  skills: IngestedSkill[],
  options: { provider: ProviderStrategy; overrides?: ModelOverrides },
): Promise<Classification> {
  const catalogue = skills
    .map((skill) =>
      [
        `- slug: ${skill.slug}`,
        `  name: ${skill.name}`,
        `  summary: ${skill.summary}`,
        `  whenToUse: ${skill.whenToUse}`,
        `  produces: ${skill.produces}`,
        skill.references?.length ? `  mentions: ${skill.references.join(", ")}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");

  log.debug(`classifying ${skills.length} skill(s)`);
  const result = await structuredCall({
    model: () => options.provider.chat("medium", options.overrides),
    schema: classificationSchema,
    system: SYSTEM,
    label: "classify",
    user: `Here are ${skills.length} skill(s):\n\n${catalogue}\n\nClassify the set and order it.`,
  });
  log.info(`classified as '${result.setKind}'`);

  return { ...result, order: reconcileOrder(result.order, skills) };
}

/**
 * The model is asked for a permutation; treat it as a preference, not a
 * guarantee. Unknown slugs are dropped, duplicates collapsed, and anything
 * omitted is appended in discovery order — so a sloppy answer degrades to a
 * worse ordering rather than a lost skill.
 */
function reconcileOrder(proposed: string[], skills: IngestedSkill[]): string[] {
  const known = new Set(skills.map((skill) => skill.slug));
  const seen = new Set<string>();
  const order: string[] = [];

  for (const slug of proposed) {
    if (known.has(slug) && !seen.has(slug)) {
      seen.add(slug);
      order.push(slug);
    }
  }
  for (const skill of skills) {
    if (!seen.has(skill.slug)) order.push(skill.slug);
  }
  return order;
}
