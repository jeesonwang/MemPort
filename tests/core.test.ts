import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, readText, removeTempDir, writeText, exists } from "./helpers/fs.js";
import { syncMemories } from "../src/core.js";
import type { Logger } from "../src/types.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

function testLogger(messages: string[]): Logger {
  return {
    info: (message) => messages.push(`info:${message}`),
    warn: (message) => messages.push(`warn:${message}`),
    error: (message) => messages.push(`error:${message}`)
  };
}

describe("syncMemories", () => {
  it("syncs summary, detailed memories, and skills", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    const messages: string[] = [];
    await writeText(join(codex, "memory_summary.md"), "summary\n\n## heading");
    await writeText(join(codex, "MEMORY.md"), "registry");
    await writeText(join(codex, "rollout_summaries", "one.md"), "rollout");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\nBody");

    const result = await syncMemories({
      projectRoot: root,
      codexPath: codex,
      updateClaudeMd: true,
      silent: false,
      homeDir: join(root, "home"),
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0",
      logger: testLogger(messages)
    });

    expect(result.memoryFilesCopied).toBe(3);
    expect(result.skillsSynced).toBe(1);
    expect(result.skillsChanged).toBe(true);
    expect(result.claudeMdUpdated).toBe(true);
    await expect(readText(join(root, ".claude", "CLAUDE.md"))).resolves.toContain("summary");
    await expect(readText(join(root, ".claude", "codex-memories", "MEMORY.md"))).resolves.toBe("registry");
    await expect(readText(join(root, ".claude", "skills", "demo", "SKILL.md"))).resolves.toContain("Body");
    await expect(exists(join(root, ".claude", "codex-memories", "extensions", "ad_hoc", "instructions.md"))).resolves.toBe(false);
  });

  it("fails clearly when memory_summary.md is empty", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "   \n");

    await expect(syncMemories({
      projectRoot: root,
      codexPath: codex,
      updateClaudeMd: true,
      silent: true,
      homeDir: join(root, "home"),
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0",
      logger: testLogger([])
    })).rejects.toThrow("memory_summary.md is empty");
  });
});
