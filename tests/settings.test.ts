import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, readText, removeTempDir } from "./helpers/fs.js";
import { installSessionStartHook } from "../src/settings.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

describe("installSessionStartHook", () => {
  it("creates settings.local.json with the MemPort SessionStart hook", async () => {
    const root = await makeTempDir();
    tempDirs.push(root);

    await installSessionStartHook({
      projectRoot: root,
      hookCommand: "memport hook session-start --project-root \"$CLAUDE_PROJECT_DIR\" --silent"
    });

    const settings = JSON.parse(await readText(join(root, ".claude", "settings.local.json")));
    expect(settings.hooks.SessionStart[0].matcher).toBe("startup|resume|clear|compact");
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain("memport hook session-start");
  });

  it("preserves existing hooks and does not duplicate MemPort hook", async () => {
    const root = await makeTempDir();
    tempDirs.push(root);
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude", "settings.local.json"), JSON.stringify({
      hooks: {
        SessionStart: [
          {
            matcher: "startup",
            hooks: [{ type: "command", command: "echo existing", timeout: 1 }]
          }
        ]
      }
    }, null, 2), "utf8");

    await installSessionStartHook({ projectRoot: root, hookCommand: "memport hook session-start --project-root \"$CLAUDE_PROJECT_DIR\" --silent" });
    await installSessionStartHook({ projectRoot: root, hookCommand: "memport hook session-start --project-root \"$CLAUDE_PROJECT_DIR\" --silent" });

    const content = await readText(join(root, ".claude", "settings.local.json"));
    const settings = JSON.parse(content);
    expect(content.match(/memport hook session-start/g)?.length).toBe(1);
    expect(settings.hooks.SessionStart.length).toBe(2);
  });
});
