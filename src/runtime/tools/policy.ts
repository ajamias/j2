import { realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

export class ToolRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolRefusal";
  }
}

export interface Workspace {
  /** Every path a tool touches must resolve inside this directory. */
  root: string;
}

export function makeWorkspace(root: string): Workspace {
  return { root: realpathSync(resolve(root)) };
}

/**
 * The single path gate. Resolves, then follows symlinks via realpath on the
 * nearest existing ancestor, then asserts containment — so neither `..` nor a
 * symlink planted inside the workspace can escape it.
 */
export function containedPath(workspace: Workspace, candidate: string): string {
  const absolute = isAbsolute(candidate) ? candidate : resolve(workspace.root, candidate);
  const real = realpathOfNearestExisting(absolute);

  if (real !== workspace.root && !real.startsWith(workspace.root + sep)) {
    throw new ToolRefusal(
      `path escapes the workspace: ${candidate} resolves outside ${workspace.root}`,
    );
  }
  return absolute;
}

function realpathOfNearestExisting(path: string): string {
  let current = path;
  for (;;) {
    try {
      return realpathSync(current);
    } catch {
      const parent = resolve(current, "..");
      // A file being created does not exist yet; check its parent instead.
      if (parent === current) return path;
      current = parent;
    }
  }
}

/** Obviously destructive or self-escalating commands, refused outright. */
const COMMAND_DENYLIST: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\brm\s+(-[a-z]*\s+)*-?[a-z]*[rf][a-z]*\s+\/(\s|$)/, why: "recursive delete of /" },
  { pattern: /\bsudo\b/, why: "privilege escalation" },
  { pattern: /\b(curl|wget)\b[^|]*\|\s*(ba|z|k|)sh\b/, why: "piping a download into a shell" },
  { pattern: /\b(mkfs|dd)\b[^\n]*\bof=\/dev\//, why: "writing to a block device" },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, why: "fork bomb" },
];

export function assertCommandAllowed(command: string): void {
  for (const { pattern, why } of COMMAND_DENYLIST) {
    if (pattern.test(command)) {
      throw new ToolRefusal(`refusing to run this command (${why}): ${command}`);
    }
  }
}

/**
 * Credentials never reach a subprocess. A skill with shell access would
 * otherwise be one `env` away from exfiltrating every provider key.
 */
export function scrubbedEnv(): NodeJS.ProcessEnv {
  const scrubbed: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/(_|^)(API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS)$/i.test(key)) continue;
    scrubbed[key] = value;
  }
  return scrubbed;
}

export const LIMITS = {
  /** Largest file body a single read_file returns. */
  readBytes: 256 * 1024,
  /** Largest file body write_file accepts. */
  writeBytes: 1024 * 1024,
  /** Largest combined stdout+stderr run_command returns. */
  commandOutputBytes: 64 * 1024,
  commandTimeoutMs: 120_000,
  globResults: 500,
  grepMatches: 200,
  listEntries: 500,
} as const;

export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n… truncated, ${text.length - limit} more characters`;
}
