import { spawn } from "node:child_process";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exists, makeTempDir, removeTempDir, writeText } from "./helpers/fs.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runBin(args: string[], options: { stdin?: string } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const projectRoot = new URL("..", import.meta.url).pathname;
    const child = spawn(process.execPath, [join(projectRoot, "bin", "memport"), ...args], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? -1, stdout, stderr }));

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}

describe("bin/memport entrypoint", () => {
  it("actually runs the sync command end-to-end via the bin wrapper", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "summary\n");

    const result = await runBin([
      "sync",
      "--project-root", root,
      "--codex-path", codex,
      "--silent"
    ]);

    expect(result.exitCode).toBe(0);
    await expect(exists(join(root, ".claude", "CLAUDE.md"))).resolves.toBe(true);
  });

  it("emits hook JSON on stdout when invoked via the bin wrapper", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "summary\n");

    const result = await runBin([
      "hook",
      "session-start",
      "--project-root", root,
      "--codex-path", codex,
      "--silent"
    ], { stdin: "{}" });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput?.hookEventName).toBe("SessionStart");
  });
});
