import { log } from "./log.js";

/** HTTP statuses worth another attempt: rate limits and server faults. */
const TRANSIENT_STATUS = /\b(408|409|429|50[0-9]|52[0-9])\b/;
const TRANSIENT_NAMES = /(timeout|abort|econnreset|enotfound|etimedout|fetch failed)/i;

function statusOf(error: Error): number | undefined {
  const candidate = error as Error & { status?: number; code?: number };
  return typeof candidate.status === "number" ? candidate.status : undefined;
}

/**
 * Retries transient failures only.
 *
 * Retrying a 401 or a 402 burns time and hides the real cause: the middleware
 * swallows each attempt's error, so a non-retryable failure that is retried to
 * exhaustion surfaces as a vague "no structured response" instead of
 * "insufficient credits".
 */
export interface RetryPolicy {
  retryOn: (error: Error) => boolean;
  /**
   * The last error seen. `modelRetryMiddleware` swallows the errors it is
   * handed — including the ones it is told not to retry — so without this the
   * real cause is lost and every failure looks like "no structured response".
   */
  lastError(): Error | undefined;
}

export function createRetryPolicy(label: string): RetryPolicy {
  let last: Error | undefined;
  const decide = retryOnTransient(label);
  return {
    retryOn: (error: Error) => {
      last = error;
      return decide(error);
    },
    lastError: () => last,
  };
}

function retryOnTransient(label: string): (error: Error) => boolean {
  return (error: Error) => {
    const status = statusOf(error);
    const transient =
      status !== undefined
        ? status === 408 || status === 409 || status === 429 || status >= 500
        : TRANSIENT_STATUS.test(error.message) || TRANSIENT_NAMES.test(error.message);

    if (!transient) {
      log.debug(`${label}: not retrying ${error.name}: ${error.message}`);
      return false;
    }
    log.warn(`${label}: retrying after ${error.name}: ${firstLine(error.message)}`);
    return true;
  };
}

/**
 * Some models reject the forced `tool_choice` that `toolStrategy` relies on
 * for structured output. When that happens the answer is a different strategy,
 * not a retry — see `withStructuredFallback`.
 */
function isUnsupportedToolChoice(error: unknown): boolean {
  return error instanceof Error && /tool_choice/i.test(error.message);
}

/**
 * Runs an attempt with the tool-call strategy, falling back to the provider's
 * native structured output if the model refuses forced tool choice.
 */
export async function withStructuredFallback<T>(
  label: string,
  attempt: (strategy: "tool" | "provider") => Promise<T>,
): Promise<T> {
  try {
    return await attempt("tool");
  } catch (error) {
    if (!isUnsupportedToolChoice(error)) throw error;
    log.debug(`${label}: model rejects forced tool_choice, using native structured output`);
    return attempt("provider");
  }
}

function firstLine(message: string): string {
  const line = message.split("\n")[0];
  return line.length > 300 ? `${line.slice(0, 300)}…` : line;
}
