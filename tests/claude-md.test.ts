import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, readText, removeTempDir } from "./helpers/fs.js";
import { renderMemportBlock, updateClaudeMd } from "../src/claude-md.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

describe("renderMemportBlock", () => {
  it("uses HTML markers so headings inside the summary do not break replacement", () => {
    const block = renderMemportBlock("Intro\n\n## Existing Heading\nDetails", new Date("2026-06-11T07:30:00.000Z"));

    expect(block).toContain("<!-- MEMPORT:BEGIN -->");
    expect(block).toContain("# Codex Memories");
    expect(block).toContain("## Existing Heading");
    expect(block).toContain("<!-- MEMPORT:END -->");
  });
});

describe("updateClaudeMd", () => {
  it("creates CLAUDE.md when missing", async () => {
    const root = await makeTempDir();
    tempDirs.push(root);

    const result = await updateClaudeMd({
      projectRoot: root,
      summary: "Memory summary",
      now: new Date("2026-06-11T07:30:00.000Z")
    });

    expect(result.changed).toBe(true);
    expect(await readText(join(root, ".claude", "CLAUDE.md"))).toContain("Memory summary");
  });

  it("replaces only the MemPort block and preserves user content", async () => {
    const root = await makeTempDir();
    tempDirs.push(root);
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(
      join(root, ".claude", "CLAUDE.md"),
      "Before\n\n<!-- MEMPORT:BEGIN -->\nold\n<!-- MEMPORT:END -->\n\nAfter\n",
      "utf8"
    );

    await updateClaudeMd({
      projectRoot: root,
      summary: "new summary\n\n## nested heading",
      now: new Date("2026-06-11T07:30:00.000Z")
    });

    const content = await readText(join(root, ".claude", "CLAUDE.md"));
    expect(content).toContain("Before");
    expect(content).toContain("new summary");
    expect(content).toContain("## nested heading");
    expect(content).toContain("After");
    expect(content).not.toContain("old");
    expect(await readText(join(root, ".claude", "CLAUDE.md.backup"))).toContain("old");
  });

  it("refuses to write when markers are unpaired", async () => {
    const root = await makeTempDir();
    tempDirs.push(root);
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude", "CLAUDE.md"), "Before\n<!-- MEMPORT:BEGIN -->\n", "utf8");

    await expect(updateClaudeMd({
      projectRoot: root,
      summary: "new",
      now: new Date("2026-06-11T07:30:00.000Z")
    })).rejects.toThrow("MemPort markers are not paired");
  });
});
