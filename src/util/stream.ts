import { getLogLevel, log } from "./log.js";

/**
 * Minimal structural view of the `AgentRunStream` returned by
 * `agent.streamEvents(input, { version: "v3" })`. Typed structurally so this
 * helper works for any agent regardless of its state/tool generics.
 */
export interface RunStreamLike<TOutput> {
  messages: AsyncIterable<{
    reasoning: AsyncIterable<string>;
    text: PromiseLike<string> & AsyncIterable<string>;
    toolCalls: PromiseLike<unknown[]>;
  }>;
  output: PromiseLike<TOutput>;
}

export interface RenderOptions {
  /** Label printed before the first token of the run. */
  label?: string;
  /** Stream reasoning and text tokens to stderr as they arrive. */
  stream?: boolean;
}

/**
 * Drains an agent run stream, optionally echoing reasoning/text tokens, and
 * resolves to the run's final state.
 *
 * The stream must be consumed even when not echoing: `run.output` only settles
 * once the underlying graph has finished producing events.
 *
 * Honesty: dishonest — drains an externally driven async stream and may
 * write tokens to stderr as a side effect.
 * Idempotency: not idempotent; a run stream can only be consumed once.
 */
export async function renderRun<TOutput>(
  run: RunStreamLike<TOutput>,
  options: RenderOptions = {},
): Promise<TOutput> {
  const echo = options.stream ?? getLogLevel() === "debug";
  if (echo && options.label) process.stderr.write(`\n--- ${options.label} ---\n`);

  log.debug(`draining run stream${options.label ? ` for ${options.label}` : ""}`);
  for await (const message of run.messages) {
    for await (const token of message.reasoning) {
      if (echo) process.stderr.write(token);
    }
    for await (const token of message.text) {
      if (echo) process.stderr.write(token);
    }
    await message.toolCalls;
  }

  if (echo) process.stderr.write("\n");
  log.info(`run stream${options.label ? ` for ${options.label}` : ""} finished`);
  return run.output;
}
