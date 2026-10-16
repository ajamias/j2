import { tool } from "@langchain/core/tools";
import { readFileSync, statSync } from "node:fs";
import { relative } from "node:path";
import { z } from "zod";
import { log } from "../../util/log.js";
import { containedPath, LIMITS, type Workspace } from "./policy.js";
import { walkFiles } from "./walk.js";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Intent: builds the `grep` agent tool, a case-insensitive regex search over
 * workspace file contents.
 * Parameters: `workspace` bounds the search to its root. Returns a
 * langchain `tool` whose handler takes `{ pattern, path, maxMatches }` and
 * returns matching `file:line: text` entries, capped at the match limit.
 * Honesty: dishonest — reads files under the workspace from disk.
 * Idempotency: idempotent; a pure read with no side effects.
 */
export function grepTool({ workspace }: { workspace: Workspace }) {
  return tool(
    ({ pattern, path, maxMatches }) => {
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "i");
      } catch (error) {
        return `invalid regular expression: ${error instanceof Error ? error.message : String(error)}`;
      }

      const root = containedPath(workspace, path ?? ".");
      const limit = Math.min(maxMatches ?? LIMITS.grepMatches, LIMITS.grepMatches);
      const hits: string[] = [];
      log.debug(`grep '${pattern}' under ${root}`);

      const scanFile = (file: string): boolean => {
        if (statSync(file).size > MAX_FILE_BYTES) return true;
        let body: string;
        try {
          body = readFileSync(file, "utf-8");
        } catch {
          return true; // not text; skip
        }
        const lines = body.split("\n");
        for (let index = 0; index < lines.length && hits.length < limit; index += 1) {
          if (regex.test(lines[index])) {
            hits.push(`${relative(workspace.root, file)}:${index + 1}: ${lines[index].trim()}`);
          }
        }
        return hits.length < limit;
      };

      if (statSync(root).isDirectory()) walkFiles(root, scanFile);
      else scanFile(root);

      log.info(`grep '${pattern}' found ${hits.length} match(es)`);
      return hits.length ? hits.join("\n") : "(no matches)";
    },
    {
      name: "grep",
      description:
        "Search file contents for a case-insensitive JavaScript regular expression. Returns file:line: text.",
      schema: z.object({
        pattern: z.string().describe("JavaScript regular expression source."),
        path: z.string().optional().describe("File or directory to search. Defaults to the workspace root."),
        maxMatches: z.number().int().min(1).optional().describe("Stop after this many matches."),
      }),
    },
  );
}
