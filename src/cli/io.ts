import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline";
import { J2Error } from "../util/errors.js";

export interface Prompter {
  ask(question: string, choices?: string[]): Promise<string>;
  close(): void;
}

/**
 * Reads one answer at a time from stdin.
 *
 * Driven by the interface's async line iterator rather than `rl.question`:
 * when stdin is a pipe the stream ends as soon as it is drained, which closes
 * the interface and makes every later `question()` reject — the iterator still
 * yields the lines that were already buffered. That keeps scripted runs
 * (`printf ... | j2 run`) working exactly like interactive ones.
 */
export function createPrompter(): Prompter {
  const rl = readline.createInterface({ input, output, terminal: input.isTTY });
  const lines = rl[Symbol.asyncIterator]();

  const next = async (): Promise<string> => {
    const { value, done } = await lines.next();
    if (done) {
      throw new J2Error(
        "runtime",
        "the workflow asked a question but stdin has no more input",
        "run it interactively, or pipe in enough answers",
      );
    }
    return String(value).trim();
  };

  return {
    async ask(question, choices) {
      // Streamed model output may have left the cursor mid-line.
      output.write(`\n${question}\n`);
      if (choices?.length) {
        choices.forEach((choice, index) => output.write(`  ${index + 1}. ${choice}\n`));
      }
      output.write("> ");

      const answer = await next();
      if (!choices?.length) return answer;

      const picked = Number.parseInt(answer, 10);
      return Number.isInteger(picked) && picked >= 1 && picked <= choices.length
        ? choices[picked - 1]
        : answer;
    },
    close() {
      rl.close();
    },
  };
}
