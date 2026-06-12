import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface InstallHookInput {
  projectRoot: string;
  hookCommand: string;
}

type JsonObject = Record<string, unknown>;

async function readJson(path: string): Promise<JsonObject> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as JsonObject;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function installSessionStartHook(input: InstallHookInput): Promise<{ changed: boolean; path: string }> {
  const claudeDir = join(input.projectRoot, ".claude");
  const settingsPath = join(claudeDir, "settings.local.json");
  await mkdir(claudeDir, { recursive: true });

  const settings = await readJson(settingsPath);
  const hooks = asObject(settings.hooks);
  const sessionStart = asArray(hooks.SessionStart);

  const alreadyInstalled = sessionStart.some((entry: any) =>
    entry.hooks?.some((h: any) => h.command === input.hookCommand)
  );

  if (!alreadyInstalled) {
    sessionStart.push({
      matcher: "startup|resume|clear|compact",
      hooks: [
        {
          type: "command",
          command: input.hookCommand,
          timeout: 10
        }
      ]
    });
  }

  hooks.SessionStart = sessionStart;
  settings.hooks = hooks;
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return { changed: !alreadyInstalled, path: settingsPath };
}
