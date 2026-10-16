import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSkillList, discoverSkills } from "../../../src/skills/discover.js";
import { J2Error } from "../../../src/util/errors.js";

function makeSkillDir(root: string, slug: string) {
  const dir = join(root, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `# ${slug}`);
  return dir;
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "j2-skills-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("buildSkillList", () => {
  test("returns skills sorted by slug", () => {
    makeSkillDir(root, "zeta");
    makeSkillDir(root, "alpha");

    const skills = buildSkillList(root);

    expect(skills.map((s) => s.slug)).toEqual(["alpha", "zeta"]);
    expect(skills[0]).toEqual({
      slug: "alpha",
      dir: join(root, "alpha"),
      skillFile: join(root, "alpha", "SKILL.md"),
    });
  });

  test("ignores subdirectories without SKILL.md", () => {
    makeSkillDir(root, "real-skill");
    mkdirSync(join(root, "not-a-skill"));

    const skills = buildSkillList(root);

    expect(skills.map((s) => s.slug)).toEqual(["real-skill"]);
  });

  test("ignores well-known non-skill directories", () => {
    makeSkillDir(root, "real-skill");
    for (const name of [".git", "node_modules", ".claude", "dist", "build"]) {
      const dir = join(root, name);
      mkdirSync(dir);
      writeFileSync(join(dir, "SKILL.md"), "not a real skill");
    }

    const skills = buildSkillList(root);

    expect(skills.map((s) => s.slug)).toEqual(["real-skill"]);
  });

  test("returns empty array when no skill directories exist", () => {
    expect(buildSkillList(root)).toEqual([]);
  });
});

describe("discoverSkills", () => {
  test("discovers skills in an existing directory", () => {
    makeSkillDir(root, "alpha");
    makeSkillDir(root, "beta");

    const skills = discoverSkills(root);

    expect(skills.map((s) => s.slug)).toEqual(["alpha", "beta"]);
  });

  test("throws no-skills when root is not a directory", () => {
    const notADir = join(root, "missing");

    expect(() => discoverSkills(notADir)).toThrow(J2Error);
    try {
      discoverSkills(notADir);
      throw new Error("expected discoverSkills to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(J2Error);
      expect((error as J2Error).code).toBe("no-skills");
    }
  });

  test("throws no-skills with subdirectory hint when root has no skill subdirectories", () => {
    try {
      discoverSkills(root);
      throw new Error("expected discoverSkills to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(J2Error);
      expect((error as J2Error).code).toBe("no-skills");
    }
  });

  test("throws no-skills with a different hint when SKILL.md sits directly in root", () => {
    writeFileSync(join(root, "SKILL.md"), "# top level");

    try {
      discoverSkills(root);
      throw new Error("expected discoverSkills to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(J2Error);
      expect((error as J2Error).hint).toContain("own subdirectory");
    }
  });
});
