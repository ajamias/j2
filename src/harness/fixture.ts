import type { z } from "zod";
import { log } from "../util/log.js";
import { HarnessError } from "../util/errors.js";

/**
 * Test seam. With `J2_FAKE_MODEL` pointed at a JSON file of `{ "<label>": ... }`
 * entries, every stage reads its result from disk instead of calling a real
 * SDK. This is what makes the discover -> IR -> emit -> transpile path
 * testable without spending tokens, independent of which harness is active.
 */
export async function loadFixture<TSchema extends z.ZodTypeAny>(
  label: string,
  schema: TSchema,
): Promise<z.infer<TSchema> | undefined> {
  const path = process.env.J2_FAKE_MODEL?.trim();
  if (!path) return undefined;

  const { readFile } = await import("node:fs/promises");
  const table = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
  const entry = table[label];

  if (entry === undefined) {
    throw new HarnessError(
      "fixture-missing",
      `J2_FAKE_MODEL fixture ${path} has no entry for '${label}'`,
      `add a "${label}" key to the fixture file`,
    );
  }

  log.debug(`${label}: using fixture from ${path}`);
  return schema.parse(entry) as z.infer<TSchema>;
}
