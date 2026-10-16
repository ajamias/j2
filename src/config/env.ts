import { J2Error } from "../util/errors.js";

export function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function requireEnv(names: readonly string[], context: string, hint: string): void {
  const missing = names.filter((name) => !env(name));
  if (missing.length > 0) {
    throw new J2Error(
      "config",
      `${context} requires ${missing.join(", ")} to be set`,
      hint,
    );
  }
}

export const OLLAMA_BASE_URL = (): string =>
  env("OLLAMA_BASE_URL") ?? env("OLLAMA_HOST") ?? "http://localhost:11434";

export const OPENROUTER_BASE_URL = (): string | undefined => env("OPENROUTER_BASE_URL");
