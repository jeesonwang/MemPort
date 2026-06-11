import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, removeTempDir } from "./helpers/fs.js";
import { hashDirectory, hashFile } from "../src/hash.js";
import { expandHome, resolveOptions } from "../src/paths.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

describe("path helpers", () => {
  it("expands tilde paths with an explicit home directory", () => {
    expect(expandHome("~/.codex/memories", "/Users/example")).toBe("/Users/example/.codex/memories");
    expect(expandHome("/tmp/project", "/Users/example")).toBe("/tmp/project");
  });

  it("resolves project and Codex paths from options, env, and cwd", () => {
    const resolved = resolveOptions({
      cwd: "/repo",
      env: { MEMPORT_CODEX_PATH: "/memories" },
      homeDir: "/Users/example",
      projectRoot: "/project"
    });

    expect(resolved.projectRoot).toBe("/project");
    expect(resolved.codexPath).toBe("/memories");
  });
});

describe("hash helpers", () => {
  it("hashes files and directories deterministically", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    await mkdir(join(dir, "nested"), { recursive: true });
    await writeFile(join(dir, "a.txt"), "A", "utf8");
    await writeFile(join(dir, "nested", "b.txt"), "B", "utf8");

    expect(await hashFile(join(dir, "a.txt"))).toMatch(/^sha256:[0-9a-f]{64}$/);
    await expect(hashDirectory(dir)).resolves.toMatch(/^sha256:[0-9a-f]{64}$/);
    await expect(hashDirectory(dir)).resolves.toBe(await hashDirectory(dir));
  });
});
