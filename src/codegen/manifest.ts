import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { log } from "../util/log.js";

/**
 * The sidecar `list` reads.
 *
 * `list` must be fast, work without an API key, and never execute generated
 * code — so it reads this file rather than importing `workflow.ts`. `meta` in
 * the generated module stays the source of truth; this is a copy plus a hash
 * so a hand-edited workflow can be flagged as stale.
 */
export const manifestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  setKind: z.string(),
  order: z.array(z.string()),
  nodes: z.array(z.object({ id: z.string(), title: z.string(), size: z.string() })),
  provider: z.string(),
  source: z.string(),
  runtime: z.string(),
  j2Version: z.string(),
  generatedAt: z.string(),
  sourceHash: z.string(),
});
export type Manifest = z.infer<typeof manifestSchema>;

export function hashSource(source: string): string {
  return createHash("sha256").update(source, "utf-8").digest("hex").slice(0, 16);
}

/**
 * Intent: persists a workflow's manifest as JSON next to its generated file.
 * Parameters: `path` is the destination; `manifest` the data to write.
 * Honesty: dishonest — writes `path` to disk.
 * Idempotency: idempotent for an unchanged `manifest` — overwrites to the
 * same bytes.
 */
export function writeManifest(path: string, manifest: Manifest): void {
  log.debug(`writing manifest ${path}`);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  log.info(`wrote manifest ${path}`);
}

/**
 * Intent: reads and validates a manifest written by `writeManifest`.
 * Parameters: `path` is the manifest file. Returns the parsed `Manifest`;
 * throws if the file is missing or fails schema validation.
 * Honesty: dishonest — reads `path` from disk.
 * Idempotency: idempotent for an unchanged file.
 */
export function readManifest(path: string): Manifest {
  log.debug(`reading manifest ${path}`);
  return manifestSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

/**
 * Last-resort reader for a workflow whose manifest is missing or corrupt.
 * Scrapes the `meta` block textually rather than importing the module, because
 * the situation where `list` most needs to work is the one where importing
 * would fail.
 */
export function scrapeMeta(source: string): Partial<Manifest> {
  const field = (name: string): string | undefined =>
    new RegExp(`^\\s*${name}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "m").exec(source)?.[1];

  const order = /^\s*order:\s*\[([^\]]*)\]/m
    .exec(source)?.[1]
    .split(",")
    .map((part) => part.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

  return {
    id: field("id"),
    title: field("title"),
    description: field("description"),
    setKind: field("setKind"),
    provider: field("provider"),
    generatedAt: field("generatedAt"),
    order,
  };
}
