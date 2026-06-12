import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTempDir, readText, removeTempDir, writeText } from "./helpers/fs.js";
import { runCli } from "../src/cli.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

describe("runCli", () => {
  it("runs sync with explicit paths", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "summary");

    const exitCode = await runCli([
      "sync",
      "--project-root",
      root,
      "--codex-path",
      codex
    ], {
      cwd: root,
      env: {},
      homeDir: join(root, "home"),
      stdout: vi.fn(),
      stderr: vi.fn()
    });

    expect(exitCode).toBe(0);
    await expect(readText(join(root, ".claude", "CLAUDE.md"))).resolves.toContain("summary");
  });

  it("prints hook JSON only to stdout", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "summary");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "skill");
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runCli([
      "hook",
      "session-start",
      "--project-root",
      root,
      "--codex-path",
      codex,
      "--silent"
    ], {
      cwd: root,
      env: {},
      homeDir: join(root, "home"),
      stdin: "{}",
      stdout,
      stderr
    });

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout.mock.calls[0][0])).not.toThrow();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("returns non-zero for unknown commands", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runCli(["unknown"], {
      cwd: "/tmp",
      env: {},
      homeDir: "/tmp/home",
      stdout,
      stderr
    });

    expect(exitCode).toBe(1);
    expect(stderr.mock.calls[0][0]).toContain("Unknown command");
  });
});
