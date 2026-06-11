import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exists, makeTempDir, readText, removeTempDir, writeText } from "./helpers/fs.js";
import { discoverCodexSkills, syncSkills } from "../src/skills.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

describe("discoverCodexSkills", () => {
  it("finds only direct child directories with SKILL.md", async () => {
    const codex = await makeTempDir();
    tempDirs.push(codex);
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
    await writeText(join(codex, "skills", "not-a-skill", "README.md"), "no");

    await expect(discoverCodexSkills(codex)).resolves.toMatchObject([
      { name: "demo" }
    ]);
  });
});

describe("syncSkills", () => {
  it("copies skills with support files and writes .memport.json", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\nBody");
    await writeText(join(codex, "skills", "demo", "scripts", "run.sh"), "echo demo");
    await writeText(join(codex, "skills", "demo", ".DS_Store"), "noise");

    const result = await syncSkills({
      projectRoot: root,
      codexPath: codex,
      homeDir: join(root, "home"),
      runId: "run-1",
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0"
    });

    expect(result.synced).toBe(1);
    expect(result.changed).toBe(true);
    await expect(readText(join(root, ".claude", "skills", "demo", "SKILL.md"))).resolves.toContain("Body");
    await expect(readText(join(root, ".claude", "skills", "demo", "scripts", "run.sh"))).resolves.toBe("echo demo");
    await expect(exists(join(root, ".claude", "skills", "demo", ".DS_Store"))).resolves.toBe(false);
    const marker = JSON.parse(await readText(join(root, ".claude", "skills", "demo", ".memport.json")));
    expect(marker.managedBy).toBe("memport");
    expect(marker.sourcePath).toBe(join(codex, "skills", "demo"));
    expect(marker.sourceHash).toMatch(/^sha256:/);
  });

  it("does not overwrite non-MemPort project skills", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(root, ".claude", "skills", "demo", "SKILL.md"), "project skill");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "codex skill");

    const result = await syncSkills({
      projectRoot: root,
      codexPath: codex,
      homeDir: join(root, "home"),
      runId: "run-1",
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0"
    });

    expect(result.synced).toBe(0);
    expect(result.warnings[0]?.code).toBe("PROJECT_SKILL_CONFLICT");
    await expect(readText(join(root, ".claude", "skills", "demo", "SKILL.md"))).resolves.toBe("project skill");
  });

  it("warns when a personal skill can shadow the synced project skill", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    const home = await makeTempDir();
    tempDirs.push(root, codex, home);
    await writeText(join(home, ".claude", "skills", "demo", "SKILL.md"), "personal");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "codex");

    const result = await syncSkills({
      projectRoot: root,
      codexPath: codex,
      homeDir: home,
      runId: "run-1",
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0"
    });

    expect(result.synced).toBe(1);
    expect(result.warnings[0]?.code).toBe("PERSONAL_SKILL_SHADOWS_PROJECT_SKILL");
  });
});
