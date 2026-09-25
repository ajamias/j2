/**
 * Lightweight logging + a node-tracing wrapper.
 *
 * `traced(name, fn)` wraps a node function so each invocation is logged at the graph-
 * assembly layer — node bodies stay free of logging calls. Logs go to stderr so they
 * never mix with the CLI's stdout (run trace, mermaid output).
 *
 * Verbosity: set `LOG_LEVEL=debug|info|warn|error` (default: info). Node calls log at
 * info; per-call timing/keys at debug.
 */

import { isGraphInterrupt } from "@langchain/langgraph";

import type { NodeFn } from "./node.js";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.LOG_LEVEL?.toLowerCase() as Level)] ?? ORDER.info;

function emit(level: Level, msg: string): void {
  if (ORDER[level] >= threshold) {
    console.error(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}`);
  }
}

export const log = {
  debug: (m: string) => emit("debug", m),
  info: (m: string) => emit("info", m),
  warn: (m: string) => emit("warn", m),
  error: (m: string) => emit("error", m),
};

/** Wrap a node function so its invocation is logged, without touching the node's body. */
export function traced(name: string, fn: NodeFn): NodeFn {
  return async (state) => {
    const start = Date.now();
    log.info(`▶ ${name}`);
    try {
      const update = await fn(state);
      const keys = Object.keys(update).join(", ") || "no-op";
      log.debug(`✓ ${name} (${Date.now() - start}ms) → ${keys}`);
      return update;
    } catch (err) {
      // interrupt() throws a GraphInterrupt to pause for human input — not an error.
      if (isGraphInterrupt(err)) {
        log.info(`⏸ ${name} paused for human input`);
      } else {
        log.error(`✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
      throw err;
    }
  };
}
