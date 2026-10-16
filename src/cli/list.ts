import { existsSync, readdirSync, readFileSync } from "node:fs";
import { generatedDir, workflowPaths } from "../config/paths.js";
import { hashSource, readManifest, scrapeMeta, type Manifest } from "../codegen/manifest.js";

interface Row {
  slug: string;
  title: string;
  description: string;
  nodes: number;
  generatedAt: string;
  status: "ok" | "stale" | "no manifest";
}

/**
 * Lists generated workflows.
 *
 * Reads manifests only — never imports a generated module. `list` has to work
 * with no API key and a broken workflow on disk, which is exactly when
 * importing would fail.
 */
export function runList(): void {
  const root = generatedDir();
  const rows = existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => describe(entry.name))
        .filter((row): row is Row => row !== undefined)
        .sort((a, b) => a.slug.localeCompare(b.slug))
    : [];

  if (rows.length === 0) {
    process.stdout.write(`no generated workflows in ${root}\n`);
    process.stdout.write("create one with: j2 generate --dir <skills directory>\n");
    return;
  }

  const width = Math.max(...rows.map((row) => row.slug.length));
  for (const row of rows) {
    const marker = row.status === "ok" ? "" : ` (${row.status})`;
    process.stdout.write(`${row.slug.padEnd(width)}  ${row.title}${marker}\n`);
    process.stdout.write(`${" ".repeat(width)}  ${row.description}\n`);
    process.stdout.write(
      `${" ".repeat(width)}  ${row.nodes} step(s), generated ${row.generatedAt}\n\n`,
    );
  }
}

function describe(slug: string): Row | undefined {
  const paths = workflowPaths(slug);
  if (!existsSync(paths.source)) return undefined;

  const source = readFileSync(paths.source, "utf-8");

  let manifest: Manifest | undefined;
  try {
    if (existsSync(paths.manifest)) manifest = readManifest(paths.manifest);
  } catch {
    manifest = undefined;
  }

  if (manifest) {
    const stale = manifest.sourceHash !== hashSource(source);
    return {
      slug,
      title: manifest.title,
      description: manifest.description,
      nodes: manifest.order.length,
      generatedAt: manifest.generatedAt,
      status: stale ? "stale" : "ok",
    };
  }

  const scraped = scrapeMeta(source);
  return {
    slug,
    title: scraped.title ?? slug,
    description: scraped.description ?? "(no description recorded)",
    nodes: scraped.order?.length ?? 0,
    generatedAt: scraped.generatedAt ?? "unknown",
    status: "no manifest",
  };
}
