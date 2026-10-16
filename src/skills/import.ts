import type { Dirent } from "node:fs";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { structuredCall } from "../harness/registry.js";
import type { HarnessStrategy } from "../harness/types.js";
import type { ModelOverrides, ProviderStrategy } from "../providers/types.js";
import { log } from "../util/log.js";
import {
  skillSemanticsSchema,
  type FrontmatterValue,
  type SkillFile,
  type SkillDirectory,
  type SkillSemantics,
  type Skill,
} from "./schema.js";
import { SkillDirectoryError } from "../util/errors.js";

export function isSkillDirectory(skillDirectory: Dirent<string>): boolean {
  if (!skillDirectory.isDirectory()) {
    return false;
  }

  const skillFilePath = join(skillDirectory.parentPath, skillDirectory.name, "SKILL.md");

  return existsSync(skillFilePath) && statSync(skillFilePath).isFile();
}

/**
 * Splits YAML frontmatter from the markdown body.
 *
 * Per the agentskills.io spec, frontmatter can include a nested `metadata`
 * map, so this delegates to a real YAML parser rather than hand-rolling one.
 */
export function parseSkillFile(markdown: string): SkillFile {
  const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = FENCE.exec(markdown);
  if (!match) return { name: "", description: "", body: markdown.trim() };

  const body = markdown.slice(match[0].length).trim();

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]);
  } catch (error) {
    log.warn(`invalid YAML frontmatter: ${(error as Error).message}`);
    return { name: "", description: "", body };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { name: "", description: "", body };
  }

  const frontmatter: Record<string, FrontmatterValue> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const coerced = coerceValue(value);
    if (coerced !== undefined) frontmatter[key] = coerced;
  }

  return {
    name: asString(frontmatter.name) ?? "",
    description: asString(frontmatter.description) ?? "",
    license: asString(frontmatter.license),
    compatibility: asString(frontmatter.compatibility),
    metadata: isMetadataMap(frontmatter.metadata) ? frontmatter.metadata : undefined,
    allowedTools: asList(frontmatter["allowed-tools"]),
    body,
  };
}

function coerceValue(value: unknown): FrontmatterValue | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "object" && value !== null) {
    const record: Record<string, string> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      record[key] = String(item);
    }
    return record;
  }
  if (value === null || value === undefined) return undefined;
  return String(value);
}

export function asString(value: FrontmatterValue | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value.join(", ");
  return undefined;
}

/** Per spec, `allowed-tools` is a space-separated string; a YAML list also works. */
export function asList(value: FrontmatterValue | undefined): string[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return undefined;
}

function isMetadataMap(value: FrontmatterValue | undefined): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Files bundled alongside SKILL.md, relative to the skill directory.
 *
 * Intent: lists every non-empty, non-hidden file under `skillDir` up to
 * `maxDepth`, so a skill's bundled assets can be referenced in extraction.
 * Parameters: `skillDir` is the skill's directory; `maxDepth` bounds the
 * recursion (default 2). Returns sorted relative paths.
 * Honesty: dishonest — reads the directory tree from disk.
 * Idempotency: idempotent for an unchanged directory tree.
 */
export function listSkillFiles(skillDir: string, maxDepth = 2): string[] {
  const found: string[] = [];

  const walk = (dir: string, depth: number): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth) walk(path, depth + 1);
      } else if (statSync(path).size > 0) {
        found.push(relative(skillDir, path));
      }
    }
  };

  walk(skillDir, 0);
  return found.sort();
}

const SYSTEM = [
  "You extract structured metadata from a SKILL.md file.",
  "The file is prose with implicit structure: a trigger section, a process, sometimes tools and arguments.",
  "Use only information present in the file. Leave optional fields unset rather than inventing them.",
  "Be literal: quote the file's own wording where a field asks for it.",
].join(" ");

export interface IngestOptions {
  provider: ProviderStrategy;
  overrides?: ModelOverrides;
  harness: HarnessStrategy;
}

export async function ingestSkill(skill: SkillFile, options: IngestOptions): Promise<SkillSemantics> {
  const body = skill.body.trim();
  if (!body) {
    log.warn(`${skill.name}: SKILL.md has no body below the frontmatter`);
  }

  log.debug(`ingesting skill ${skill.name}`);
  const extracted = await structuredCall({
    harness: options.harness,
    provider: options.provider,
    size: "small",
    overrides: options.overrides,
    schema: skillSemanticsSchema,
    system: SYSTEM,
    label: `ingest:${skill.name}`,
    user: [`Skill directory: ${skill.name}`, "", "SKILL.md content:", "```markdown", body, "```"].join("\n"),
  });
  log.info(`ingested skill ${skill.name}`);

  return extracted;
}

export async function importSkills(skillsRoot: string, options: IngestOptions): Promise<Skill[]> {
  const directoryEntries = readdirSync(skillsRoot, { withFileTypes: true });
  if (directoryEntries.length === 0) {
    throw new SkillDirectoryError("directory is empty: expected at least one subdirectory containing SKILL.md");
  }

  const skillDirectoryEntries = directoryEntries.filter((entry) => isSkillDirectory(entry));
  if (skillDirectoryEntries.length === 0) {
    throw new SkillDirectoryError(`no skills found in ${skillsRoot}: expected at least one subdirectory containing SKILL.md`);
  }

  const skills: Skill[] = await Promise.all(
    skillDirectoryEntries.map(async (entry) => {
      const skillFile: SkillFile = parseSkillFile(readFileSync(join(entry.parentPath, entry.name, "SKILL.md"), "utf-8"));
      const skillDir: SkillDirectory = { slug: entry.name, parentPath: entry.parentPath };
      const skillSemantics: SkillSemantics = await ingestSkill(skillFile, options);
      return { ...skillSemantics, ...skillDir, ...skillFile };
    })
  );

  return skills;
}