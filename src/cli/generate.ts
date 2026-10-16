import { logger } from "../util/log.js";

export interface GenerateOptions {
  skillDir: string;
  name: string;
  llm: string;
  systemOneModel: string;
  provider: string;
  harness: string;
  force: boolean;
  dryRun?: boolean;
}

export function runGenerate(options: GenerateOptions): Promise<void> {
  logger.info("GenerateOptions", { options });
  // Implementation of the generate functionality goes here.
  return Promise.resolve();
}