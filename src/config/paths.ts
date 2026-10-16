import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Root of j2's own config, honouring XDG_CONFIG_HOME. Default `~/.config/j2`. */
export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.trim() ? xdg : join(homedir(), ".config");
  return process.env.J2_CONFIG_DIR?.trim() || join(base, "j2");
}

/** Where `generate` writes workflows and `list` reads them from. */
export function generatedDir(): string {
  return join(configDir(), "generated");
}

export function workflowDir(slug: string): string {
  return join(generatedDir(), slug);
}

export interface WorkflowPaths {
  dir: string;
  source: string;
  compiled: string;
  manifest: string;
}

export function workflowPaths(slug: string): WorkflowPaths {
  const dir = workflowDir(slug);
  return {
    dir,
    source: join(dir, "workflow.ts"),
    compiled: join(dir, "workflow.mjs"),
    manifest: join(dir, "manifest.json"),
  };
}

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

/**
 * Absolute path to the installed j2 runtime entry point. Generated workflows
 * live outside any `node_modules`, so they cannot use a bare specifier — they
 * import this exact path instead.
 */
export function runtimeEntryPath(): string {
  const compiled = resolve(fileURLToPath(new URL("../runtime/index.js", import.meta.url)));
  if (existsSync(compiled)) return compiled;
  // Running from source (`bun run src/index.ts`): point at the TypeScript entry.
  const source = compiled.replace(/\.js$/, ".ts");
  if (existsSync(source)) return source;
  return compiled;
}
