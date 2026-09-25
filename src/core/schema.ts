import { z } from "zod";

export const InterViewOutputSchema = z.object({
  hypothesis: z.string(), // the agent's current best guess at the user's intent
  confidence: z.number(), // the agent's confidence in its hypothesis (0-1)
  question: z.string(), // the next question to ask the user (if confidence < 0.95)
  guess: z.string(), // the agent's guess at the user's answer to the next question (if confidence < 0.95)
});