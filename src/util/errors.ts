export class SkillDirectoryError extends Error {
  constructor(message: string) {
    const name = "SkillDirectoryError";
    super(`${name}: ${message}`);
    this.name = name;
  }
}

export type J2ErrorKind = "config" | "usage" | "runtime" | "not-found" | "codegen" | "model";

/** The one error type surfaced to the CLI; `kind` picks the exit code, `hint` is the actionable fix. */
export class J2Error extends Error {
  constructor(
    public readonly kind: J2ErrorKind,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "J2Error";
  }
}

export type HarnessErrorKind =
  | "unknown-harness"
  | "incompatible-provider"
  | "empty-response"
  | "sdk-error"
  | "fixture-missing";

/** Raised by anything under `harness/` — picking a harness, or driving one's SDK. */
export class HarnessError extends Error {
  constructor(
    public readonly kind: HarnessErrorKind,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "HarnessError";
  }
}

export type ProviderErrorKind =
  | "unknown-provider"
  | "api-error"
  | "auth-failure"
  | "rate-limit"
  | "model-not-found"
  | "network-error"
  | "invalid-response"
  | "invalid-config";

/** Raised by anything under `providers/` — initializing providers or calling provider APIs. */
export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}