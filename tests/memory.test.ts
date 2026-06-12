import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, readText, removeTempDir, writeText, exists } from "./helpers/fs.js";
import { listAllowlistedMemoryFiles, syncDetailedMemories } from "../src/memory.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

describe("listAllowlistedMemoryFiles", () => {
  it("includes only default memory files and rollout summaries", async () => {
    const codex = await makeTempDir();
    tempDirs.push(codex);
    await writeText(join(codex, "memory_summary.md"), "summary");
    await writeText(join(codex, "MEMORY.md"), "registry");
    await writeText(join(codex, "raw_memories.md"), "raw");
    await writeText(join(codex, "rollout_summaries", "a.md"), "rollout");
    await writeText(join(codex, "extensions", "ad_hoc", "instructions.md"), "ad hoc");
    await writeText(join(codex, "automations", "abc", "memory.md"), "automation");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "skill");
    await writeText(join(codex, ".omx", "state.json"), "{}");

    await expect(listAllowlistedMemoryFiles(codex)).resolves.toEqual([
      "MEMORY.md",
      "memory_summary.md",
      "raw_memories.md",
      "rollout_summaries/a.md"
    ]);
  });

  it("excludes unknown files even when nested under unknown top-level directories", async () => {
    const codex = await makeTempDir();
    tempDirs.push(codex);
    await writeText(join(codex, "memory_summary.md"), "summary");
    // A future / unknown top-level directory should not silently smuggle files in.
    await writeText(join(codex, "projects", "foo", "notes.md"), "notes");
    await writeText(join(codex, "projects", "foo", "MEMORY.md"), "nested registry");

    await expect(listAllowlistedMemoryFiles(codex)).resolves.toEqual([
      "memory_summary.md"
    ]);
  });
});

describe("syncDetailedMemories", () => {
  it("copies allowlisted files into .claude/codex-memories through staging", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "summary");
    await writeText(join(codex, "rollout_summaries", "a.md"), "rollout");

    const result = await syncDetailedMemories({
      projectRoot: root,
      codexPath: codex,
      runId: "run-1"
    });

    expect(result.filesCopied).toBe(2);
    await expect(readText(join(root, ".claude", "codex-memories", "memory_summary.md"))).resolves.toBe("summary");
    await expect(readText(join(root, ".claude", "codex-memories", "rollout_summaries", "a.md"))).resolves.toBe("rollout");
    await expect(exists(join(root, ".claude", ".memport-tmp", "run-1"))).resolves.toBe(false);
  });
});
