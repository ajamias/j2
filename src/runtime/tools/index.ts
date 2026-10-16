import type { ClientTool } from "@langchain/core/tools";
import { askHumanTool } from "../hitl.js";
import { globTool, listDirTool, readFileTool, writeFileTool, type FsToolContext } from "./fs.js";
import { TOOL_NAMES, type ToolName } from "./names.js";
import { makeWorkspace, type Workspace } from "./policy.js";
import { grepTool } from "./search.js";
import { runCommandTool } from "./shell.js";

export interface ToolsetOptions {
  /** Every path a tool touches must resolve inside this directory. */
  workdir: string;
  /** The node asking for tools; shown to the user in approval prompts. */
  nodeId: string;
  /** Tools this node is allowed, already resolved at generate time. */
  allow: readonly string[];
  onWrite: (path: string, note: string) => void;
}

export interface Toolset {
  tools: ClientTool[];
  names: ToolName[];
  workspace: Workspace;
}

/**
 * Builds a node's toolset.
 *
 * `allow` is frozen into the generated workflow, so this only instantiates
 * what was already approved — it never widens the set.
 */
export function builtinTools(options: ToolsetOptions): Toolset {
  const workspace = makeWorkspace(options.workdir);
  const context: FsToolContext = { workspace, onWrite: options.onWrite };
  const allow = new Set(options.allow);

  const factories: Record<ToolName, () => ClientTool> = {
    read_file: () => readFileTool(context),
    write_file: () => writeFileTool(context),
    list_dir: () => listDirTool(context),
    glob: () => globTool(context),
    grep: () => grepTool({ workspace }),
    run_command: () => runCommandTool({ workspace }),
    ask_human: () => askHumanTool({ nodeId: options.nodeId }),
  };

  const names = TOOL_NAMES.filter((name) => allow.has(name));
  return { tools: names.map((name) => factories[name]()), names, workspace };
}

export { TOOL_NAMES, normalizeToolName, type ToolName } from "./names.js";
export { ToolRefusal, type Workspace } from "./policy.js";
