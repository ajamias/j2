#!/usr/bin/env node
import { buildProgram } from "./cli/program.js";

// `j2 list | head` closes stdout early; without this the write raises an
// unhandled EPIPE and the process dies with a stack trace.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
    throw error;
  });
}

async function main(): Promise<void> {
  await buildProgram().parseAsync(process.argv);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error("An unexpected error occurred:", String(error));
  }
  process.exit(1);
});
