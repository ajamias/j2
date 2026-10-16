/**
 * Leveled logging to stderr, so stdout stays clean for command output
 * (workflow listings, streamed model text, generated paths).
 */
const LEVELS = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof LEVELS)[number];

function envLevel(): LogLevel {
  const raw = (process.env.J2_LOG_LEVEL ?? process.env.LOG_LEVEL ?? "info").toLowerCase();
  return (LEVELS as readonly string[]).includes(raw) ? (raw as LogLevel) : "info";
}

let current: LogLevel = envLevel();

export function setLogLevel(level: LogLevel): void {
  current = level;
}

export function getLogLevel(): LogLevel {
  return current;
}

function enabled(level: Exclude<LogLevel, "silent">): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(current);
}

function write(level: Exclude<LogLevel, "silent">, parts: unknown[]): void {
  if (!enabled(level)) return;
  const text = parts
    .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
    .join(" ");
  process.stderr.write(`${text}\n`);
}

export const log = {
  debug: (...parts: unknown[]) => write("debug", parts),
  info: (...parts: unknown[]) => write("info", parts),
  warn: (...parts: unknown[]) => write("warn", ["warning:", ...parts]),
  error: (...parts: unknown[]) => write("error", ["error:", ...parts]),
};
