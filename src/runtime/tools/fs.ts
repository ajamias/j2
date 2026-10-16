import { tool } from "@langchain/core/tools";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { log } from "../../util/log.js";
import { containedPath, LIMITS, truncate, type Workspace } from "./policy.js";
import { isSkipped, walkFiles } from "./walk.js";

export interface FsToolContext {
  workspace: Workspace;
  /** Called whenever a file is written, so the run can record its artifacts. */
  onWrite: (path: string, note: string) => void;
}

/**
 * Intent: builds the `read_file` agent tool.
 * Parameters: `workspace` bounds the read. Returns a langchain `tool` whose
 * handler takes `{ path, offset, limit }` and returns the file content
 * (optionally a line range), truncated to the read limit.
 * Honesty: dishonest — reads a file under the workspace from disk.
 * Idempotency: idempotent; a pure read with no side effects.
 */
export function readFileTool({ workspace }: FsToolContext) {
  return tool(
    ({ path, offset, limit }) => {
      const absolute = containedPath(workspace, path);
      log.debug(`reading ${absolute}`);
      const body = readFileSync(absolute, "utf-8");

      if (offset === undefined && limit === undefined) {
        return truncate(body, LIMITS.readBytes);
      }
      const lines = body.split("\n");
      const start = Math.max(0, (offset ?? 1) - 1);
      const slice = lines.slice(start, start + (limit ?? lines.length));
      return truncate(slice.join("\n"), LIMITS.readBytes);
    },
    {
      name: "read_file",
      description:
        "Read a UTF-8 text file inside the workspace. Optionally read a line range with offset (1-based) and limit.",
      schema: z.object({
        path: z.string().describe("Path to the file, relative to the workspace root."),
        offset: z.number().int().min(1).optional().describe("First line to read, 1-based."),
        limit: z.number().int().min(1).optional().describe("How many lines to read."),
      }),
    },
  );
}

/**
 * Intent: builds the `write_file` agent tool.
 * Parameters: `workspace` bounds the write; `onWrite` is called with the
 * written path and note so the run can record its artifacts. Returns a
 * langchain `tool` whose handler takes `{ path, content, note }` and returns
 * a confirmation string, or a refusal if `content` exceeds the write limit.
 * Honesty: dishonest — creates directories and writes a file under the
 * workspace, and invokes the caller-supplied `onWrite` side effect.
 * Idempotency: idempotent for the same `path`/`content` — overwrites to the
 * same bytes — but `onWrite` is invoked on every call regardless.
 */
export function writeFileTool({ workspace, onWrite }: FsToolContext) {
  return tool(
    ({ path, content, note }) => {
      if (content.length > LIMITS.writeBytes) {
        return `refused: content is ${content.length} bytes, over the ${LIMITS.writeBytes} byte limit`;
      }
      const absolute = containedPath(workspace, path);
      log.debug(`writing ${content.length} bytes to ${absolute}`);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content, "utf-8");
      onWrite(absolute, note ?? "");
      log.info(`wrote ${relative(workspace.root, absolute)}`);
      return `wrote ${content.length} bytes to ${relative(workspace.root, absolute)}`;
    },
    {
      name: "write_file",
      description:
        "Create or overwrite a text file inside the workspace. Parent directories are created as needed.",
      schema: z.object({
        path: z.string().describe("Path to write, relative to the workspace root."),
        content: z.string().describe("Full file contents. This replaces any existing file."),
        note: z.string().optional().describe("One line on why this file was written."),
      }),
    },
  );
}

/**
 * Intent: builds the `list_dir` agent tool.
 * Parameters: `workspace` bounds the listing. Returns a langchain `tool`
 * whose handler takes `{ path, depth }` and returns entries (directories
 * suffixed `/`, files annotated with size), skipping hidden files, `.git`,
 * and `node_modules`, capped at the list-entries limit.
 * Honesty: dishonest — reads directory entries and file sizes from disk.
 * Idempotency: idempotent; a pure read with no side effects.
 */
export function listDirTool({ workspace }: FsToolContext) {
  return tool(
    ({ path, depth }) => {
      const root = containedPath(workspace, path ?? ".");
      const maxDepth = depth ?? 1;
      const entries: string[] = [];

      const walk = (dir: string, level: number): void => {
        if (entries.length >= LIMITS.listEntries) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (isSkipped(entry.name)) continue;
          if (entries.length >= LIMITS.listEntries) return;
          const child = join(dir, entry.name);
          const shown = relative(workspace.root, child) || ".";
          if (entry.isDirectory()) {
            entries.push(`${shown}/`);
            if (level < maxDepth) walk(child, level + 1);
          } else {
            entries.push(`${shown} (${statSync(child).size} bytes)`);
          }
        }
      };

      log.debug(`listing ${root} (depth ${maxDepth})`);
      walk(root, 1);
      return entries.length ? entries.join("\n") : "(empty)";
    },
    {
      name: "list_dir",
      description:
        "List the contents of a directory inside the workspace. Hidden files, .git, and node_modules are skipped.",
      schema: z.object({
        path: z.string().optional().describe("Directory to list. Defaults to the workspace root."),
        depth: z.number().int().min(1).max(5).optional().describe("How many levels to descend. Default 1."),
      }),
    },
  );
}

/**
 * Intent: builds the `glob` agent tool.
 * Parameters: `workspace` bounds the search. Returns a langchain `tool`
 * whose handler takes `{ pattern, cwd }` and returns matching relative
 * paths, capped at the glob-results limit.
 * Honesty: dishonest — walks the workspace directory tree on disk.
 * Idempotency: idempotent; a pure read with no side effects.
 */
export function globTool({ workspace }: FsToolContext) {
  return tool(
    ({ pattern, cwd }) => {
      const root = containedPath(workspace, cwd ?? ".");
      const matcher = globToRegExp(pattern);
      const matches: string[] = [];

      log.debug(`glob '${pattern}' under ${root}`);
      walkFiles(root, (file) => {
        if (matcher.test(relative(root, file))) matches.push(relative(workspace.root, file));
        return matches.length < LIMITS.globResults;
      });

      log.info(`glob '${pattern}' matched ${matches.length} file(s)`);
      return matches.length ? matches.sort().join("\n") : "(no matches)";
    },
    {
      name: "glob",
      description: "Find files by glob pattern inside the workspace. Supports *, ** and ?.",
      schema: z.object({
        pattern: z.string().describe("Glob pattern, e.g. 'src/**/*.ts'."),
        cwd: z.string().optional().describe("Directory to search from. Defaults to the workspace root."),
      }),
    },
  );
}

/** Supports the subset of glob syntax skills actually use: `*`, `**`, `?`. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const source = escaped
    .replace(/\*\*\//g, "\u0000SLASH\u0000")
    .replace(/\*\*/g, "\u0000ANY\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000SLASH\u0000/g, "(?:.*/)?")
    .replace(/\u0000ANY\u0000/g, ".*");
  return new RegExp(`^${source}$`);
}
