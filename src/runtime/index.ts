/**
 * The public surface a generated workflow imports — and nothing else.
 *
 * Generated files live in `~/.config/j2/generated`, outside any `node_modules`,
 * so they cannot resolve bare specifiers. They import this module by absolute
 * path instead, which means everything they need, including `zod`, has to be
 * re-exported from here. Keep this list in step with `codegen/emit.ts`.
 */
export { z } from "zod";

export {
  appended,
  baseState,
  lastValue,
  workingEntrySchema,
  type WorkingEntry,
} from "./state.js";

export { defineSkillNode, type SkillNodeDefinition } from "./node.js";

export {
  buildWorkflow,
  type BuildOptions,
  type WorkflowModule,
} from "./workflow.js";
