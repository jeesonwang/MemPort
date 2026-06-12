import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { syncMemories } from "./core.js";
import { installSessionStartHook } from "./settings.js";
import type { SyncOptions } from "./types.js";

export interface InitOptions extends SyncOptions {
  installHook: boolean;
  hookCommand: string;
}

export interface InitResult {
  hookInstalled: boolean;
  syncCompleted: boolean;
}

export async function initProject(options: InitOptions): Promise<InitResult> {
  await mkdir(join(options.projectRoot, ".claude"), { recursive: true });

  let hookInstalled = false;
  if (options.installHook) {
    const hook = await installSessionStartHook({
      projectRoot: options.projectRoot,
      hookCommand: options.hookCommand
    });
    hookInstalled = hook.changed;
  }

  await syncMemories(options);
  return { hookInstalled, syncCompleted: true };
}
