import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Directories no tool descends into: noise, and often enormous. */
export const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".venv"]);

export function isSkipped(name: string): boolean {
  return name.startsWith(".") || SKIP_DIRS.has(name);
}

/**
 * Depth-first walk over files under `root`.
 *
 * `visit` returns false to stop the walk, which is how the result caps on
 * `glob` and `grep` are enforced without each of them re-implementing the
 * recursion.
 *
 * Honesty: dishonest — reads directory entries under `root` from disk, and
 * invokes the caller-supplied `visit`, whose own honesty is the caller's
 * responsibility.
 * Idempotency: idempotent for an unchanged directory tree, assuming `visit`
 * itself has no side effects.
 */
export function walkFiles(root: string, visit: (file: string) => boolean): void {
  const descend = (dir: string): boolean => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (isSkipped(entry.name)) continue;
      const child = join(dir, entry.name);
      const keepGoing = entry.isDirectory() ? descend(child) : visit(child);
      if (!keepGoing) return false;
    }
    return true;
  };
  descend(root);
}
