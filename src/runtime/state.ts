import { withLangGraph } from "@langchain/langgraph/zod";
import { z } from "zod";

/**
 * An append-only channel. LangGraph reducers are per-channel, which is why a
 * node's context is flattened into namespaced channels rather than stored as
 * one nested object — a nested object would get last-value semantics and
 * clobber the working log on every write.
 */
export function appended<T extends z.ZodTypeAny>(item: T) {
  return withLangGraph(z.array(item), {
    reducer: { fn: (left: z.infer<T>[], right: z.infer<T>[]) => left.concat(right) },
    default: () => [] as z.infer<T>[],
  });
}

/** A channel that holds the most recent write, absent until first written. */
export function lastValue<T extends z.ZodTypeAny>(schema: T) {
  return withLangGraph(schema.optional(), { default: () => undefined });
}

/**
 * The working-context entry shape. Fixed by j2 rather than designed per skill:
 * it is a loop journal, and every node's loop looks the same.
 */
export const workingEntrySchema = z.object({
  iteration: z.number(),
  kind: z.enum(["thought", "tool", "note"]),
  text: z.string(),
});
export type WorkingEntry = z.infer<typeof workingEntrySchema>;

export const artifactSchema = z.object({
  path: z.string(),
  note: z.string(),
});
export type Artifact = z.infer<typeof artifactSchema>;

/**
 * Channels every workflow has. Generated files spread this into their own
 * `z.object({ ...baseState, <node>__working: ..., <node>__output: ... })`.
 */
export const baseState = {
  goal: z.string(),
  workdir: z.string(),
  log: appended(z.string()),
  artifacts: appended(artifactSchema),
};
