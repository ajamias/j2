import { writeFileSync } from "node:fs";
import ts from "typescript";
import { J2Error } from "../util/errors.js";
import { log } from "../util/log.js";

/**
 * Strips types from a generated workflow so Node can import it directly.
 *
 * `transpileModule` is syntax-only — it catches malformed output but not type
 * errors. `checkWorkflow` is the stricter pass, run when `--check` is passed.
 *
 * Honesty: dishonest — writes `outPath` to disk.
 * Idempotency: idempotent for unchanged `source` — produces the same output
 * file; throws `J2Error` if `source` doesn't parse.
 */
export function transpileWorkflow(source: string, sourcePath: string, outPath: string): void {
  log.debug(`transpiling ${sourcePath}`);
  const result = ts.transpileModule(source, {
    fileName: sourcePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  });

  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new J2Error("codegen", `generated workflow does not parse:\n${formatDiagnostics(errors)}`);
  }

  writeFileSync(outPath, result.outputText, "utf-8");
  log.info(`transpiled ${sourcePath} -> ${outPath}`);
}

/**
 * Full type check of one generated file. Slower; opt in with `--check`.
 *
 * Honesty: dishonest — reads `sourcePath` and its project files from disk via
 * the TypeScript compiler.
 * Idempotency: idempotent; throws `J2Error` if `sourcePath` doesn't type-check.
 */
export function checkWorkflow(sourcePath: string): void {
  log.debug(`type-checking ${sourcePath}`);
  const program = ts.createProgram([sourcePath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  });

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === sourcePath);

  if (diagnostics.length > 0) {
    throw new J2Error(
      "codegen",
      `generated workflow does not type-check:\n${formatDiagnostics(diagnostics)}`,
    );
  }
  log.info(`${sourcePath} type-checks`);
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  });
}
