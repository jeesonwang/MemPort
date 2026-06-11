import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, removeTempDir, writeText } from "./helpers/fs.js";
import { runSessionStartHook } from "../src/hook.js";
import type { Logger } from "../src/types.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

describe("runSessionStartHook", () => {
  it("returns reloadSkills when sync writes or updates skills", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "summary");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");

    const output = await runSessionStartHook({
      projectRoot: root,
      codexPath: codex,
      homeDir: join(root, "home"),
      stdin: JSON.stringify({ hook_event_name: "SessionStart" }),
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0",
      logger: silentLogger
    });

    expect(output.hookSpecificOutput?.hookEventName).toBe("SessionStart");
    expect(output.hookSpecificOutput?.reloadSkills).toBe(true);
    expect(output.hookSpecificOutput?.additionalContext).toContain("MemPort 已同步 Codex 记忆");
  });

  it("returns systemMessage instead of throwing on sync failure", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);

    const output = await runSessionStartHook({
      projectRoot: root,
      codexPath: codex,
      homeDir: join(root, "home"),
      stdin: "",
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0",
      logger: silentLogger
    });

    expect(output.systemMessage).toContain("MemPort 同步失败");
  });
});
