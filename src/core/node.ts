/**
 * Node plugin types.
 *
 * A node is a plugin module exposing `NAME` and `build(ctx) -> NodeFn`. Nodes are fully
 * self-contained: each composes its own prompt, output parsing, and state writes using the
 * provider on `ctx` (`ctx.provider.run` / `ctx.provider.runJson`). This module provides only
 * the shared types — there are no node-shaped factories, so every node has full, granular
 * control over its behavior.
 */

import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import type { AgentStateType, NodeUpdate } from "../state.js";
import { defaultProvider, type Provider } from "./provider.js";

/** Runtime config passed to every node's `build`. */
export interface NodeContext {
  /** Agent provider used by every node in this run (anthropic | openai). */
  provider: Provider;
  /** Anthropic permission mode; ignored by providers without a permission gate. */
  permissionMode: PermissionMode;
  model: string | null;
}

export function defaultContext(overrides: Partial<NodeContext> = {}): NodeContext {
  return { provider: defaultProvider, permissionMode: "acceptEdits", model: null, ...overrides };
}

/** A LangGraph node callable. */
export type NodeFn = (state: AgentStateType) => NodeUpdate | Promise<NodeUpdate>;
