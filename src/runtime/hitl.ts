import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";

/** Payload a node sends up to the CLI when it needs the user. */
export interface AskHumanRequest {
  kind: "question";
  nodeId: string;
  question: string;
  choices?: string[];
}

export function isAskHumanRequest(value: unknown): value is AskHumanRequest {
  return typeof value === "object" && value !== null && (value as AskHumanRequest).kind === "question";
}

/**
 * Lets a node pause and ask the user something.
 *
 * `interrupt` suspends the graph; the CLI's pump prints the question, reads a
 * line, and resumes with `new Command({ resume })`. The response schema makes
 * a malformed resume a clean validation error instead of a confusing failure
 * three steps later.
 */
export function askHumanTool({ nodeId }: { nodeId: string }) {
  return tool(
    ({ question, choices }) => {
      const request: AskHumanRequest = { kind: "question", nodeId, question, choices };
      return interrupt<AskHumanRequest, string>(request, { responseSchema: z.string() });
    },
    {
      name: "ask_human",
      description:
        "Ask the user one question and wait for their answer. Use this whenever you need information only they have. Ask one thing at a time.",
      schema: z.object({
        question: z.string().describe("The question, phrased for a human. One question only."),
        choices: z
          .array(z.string())
          .optional()
          .describe("Offer concrete options when the answer is a choice rather than free text."),
      }),
    },
  );
}

/**
 * Approval gate for `run_command`. Returned as middleware config so the agent
 * interrupts before the tool runs rather than after.
 */
export function shellApprovalConfig(nodeId: string) {
  return {
    run_command: {
      allowedDecisions: ["approve", "edit", "reject"] as Array<"approve" | "edit" | "reject">,
      description: `[${nodeId}] wants to run a command`,
    },
  };
}
