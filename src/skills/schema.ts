import { z } from "zod";

export const frontmatterValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.record(z.string()),
]);
export type FrontmatterValue = z.infer<typeof frontmatterValueSchema>;

export const skillFileSchema = z.object({
  name: z.string(),
  description: z.string(),
  license: z.string().optional(),
  compatibility: z.string().optional(),
  metadata: z.record(z.string()).optional(),
  allowedTools: z.array(z.string()).optional(),
  body: z.string(),
});
export type SkillFile = z.infer<typeof skillFileSchema>;

export const skillDirectorySchema = z.object({
  slug: z.string(),
  parentPath: z.string(),
});
export type SkillDirectory = z.infer<typeof skillDirectorySchema>;

export const skillSemanticsSchema = z.object({
  summary: z.string(),
  whenToUse: z.string(),
  input: z.string(),
  output: z.string(),
  references: z.array(z.string()).optional(),
  interactive: z.boolean(),
});
export type SkillSemantics = z.infer<typeof skillSemanticsSchema>;

export const skillSchema = skillFileSchema
  .merge(skillDirectorySchema)
  .merge(skillSemanticsSchema);
export type Skill = z.infer<typeof skillSchema>;
