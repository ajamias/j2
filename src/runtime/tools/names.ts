/** The canonical built-in toolset. Generated workflows may only name these. */
export const TOOL_NAMES = [
  "read_file",
  "write_file",
  "list_dir",
  "glob",
  "grep",
  "run_command",
  "ask_human",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** Tools that mutate the workspace or the outside world. */
export const MUTATING_TOOLS: readonly ToolName[] = ["write_file", "run_command"];

/** Off unless explicitly enabled: see `--allow-shell`. */
export const SHELL_TOOL: ToolName = "run_command";

/**
 * Skill files in the wild name tools using Claude Code's vocabulary. Map those
 * onto j2's toolset rather than failing on an unrecognised name.
 */
const ALIASES: Record<string, ToolName> = {
  read: "read_file",
  readfile: "read_file",
  view: "read_file",
  write: "write_file",
  edit: "write_file",
  writefile: "write_file",
  ls: "list_dir",
  listdir: "list_dir",
  glob: "glob",
  grep: "grep",
  search: "grep",
  bash: "run_command",
  shell: "run_command",
  runcommand: "run_command",
  askuserquestion: "ask_human",
  askhuman: "ask_human",
};

/** Resolves a tool name as written in a SKILL.md to a built-in, if possible. */
export function normalizeToolName(raw: string): ToolName | undefined {
  const key = raw.trim().toLowerCase().replace(/[\s_-]/g, "");
  if ((TOOL_NAMES as readonly string[]).includes(raw.trim().toLowerCase())) {
    return raw.trim().toLowerCase() as ToolName;
  }
  return ALIASES[key];
}
