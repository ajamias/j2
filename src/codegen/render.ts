import { J2Error } from "../util/errors.js";
import type { FieldSpec } from "../pipeline/spec.js";

/** A JavaScript string literal, safe for any content including backticks. */
export function literal(value: string): string {
  return JSON.stringify(value);
}

/** A template literal, used for multi-line prompts so they stay readable. */
export function templateLiteral(value: string): string {
  return `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
}

export function indent(source: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return source
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

const SCALAR_ZOD: Record<string, string> = {
  string: "z.string()",
  number: "z.number()",
  boolean: "z.boolean()",
};

const SCALAR_TS: Record<string, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
};

/** A file the node wrote. Fixed shape, so nodes describe artifacts uniformly. */
const FILE_ZOD = "z.object({ path: z.string(), summary: z.string() })";
const FILE_TS = "{ path: string; summary: string }";

/** Renders one field's type into Zod source. */
export function renderType(field: FieldSpec): string {
  switch (field.kind) {
    case "string":
    case "number":
    case "boolean":
      return SCALAR_ZOD[field.kind];
    case "enum":
      return `z.enum([${(field.values ?? []).map(literal).join(", ")}])`;
    case "stringList":
      return "z.array(z.string())";
    case "numberList":
      return "z.array(z.number())";
    case "fileList":
      return `z.array(${FILE_ZOD})`;
    case "objectList": {
      const inner = (field.itemFields ?? [])
        .map((item) => `${item.name}: ${SCALAR_ZOD[item.kind]}.describe(${literal(item.description)})`)
        .join(", ");
      return `z.array(z.object({ ${inner} }))`;
    }
  }
}

/** Renders the same field as a TypeScript type, for the context type alias. */
export function renderTsType(field: FieldSpec): string {
  switch (field.kind) {
    case "string":
    case "number":
    case "boolean":
      return SCALAR_TS[field.kind];
    case "enum":
      return (field.values ?? []).map(literal).join(" | ") || "string";
    case "stringList":
      return "readonly string[]";
    case "numberList":
      return "readonly number[]";
    case "fileList":
      return `readonly ${FILE_TS}[]`;
    case "objectList": {
      const inner = (field.itemFields ?? [])
        .map((item) => `${item.name}: ${SCALAR_TS[item.kind]}`)
        .join("; ");
      return `readonly { ${inner} }[]`;
    }
  }
}

/** Renders a node's output schema as a multi-line `z.object({...})`. */
export function renderObjectSchema(fields: FieldSpec[]): string {
  if (fields.length === 0) {
    throw new J2Error("codegen", "a node output schema must have at least one field");
  }
  const lines = fields.map((field) => {
    const base = field.optional ? `${renderType(field)}.optional()` : renderType(field);
    return `  ${field.name}: ${base}.describe(${literal(field.description)}),`;
  });
  return `z.object({\n${lines.join("\n")}\n})`;
}

/** `interview_me` -> `InterviewMe`, for generated schema and type names. */
export function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}
