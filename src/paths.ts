import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Logger, ResolveOptionsInput, SyncOptions } from "./types.js";

const consoleLogger: Logger = {
  info: (message) => console.error(message),
  warn: (message) => console.error(message),
  error: (message) => console.error(message)
};

export function expandHome(input: string, homeDir = homedir()): string {
  if (input === "~") return homeDir;
  if (input.startsWith("~/")) return resolve(homeDir, input.slice(2));
  return input;
}

export function resolveOptions(input: ResolveOptionsInput): SyncOptions {
  const codexCandidate = input.codexPath ?? input.env.MEMPORT_CODEX_PATH ?? "~/.codex/memories";
  const projectCandidate = input.projectRoot ?? input.env.MEMPORT_PROJECT_ROOT ?? input.cwd;

  return {
    projectRoot: resolve(expandHome(projectCandidate, input.homeDir)),
    codexPath: resolve(expandHome(codexCandidate, input.homeDir)),
    updateClaudeMd: input.updateClaudeMd ?? true,
    silent: input.silent ?? false,
    homeDir: input.homeDir,
    now: input.now ?? new Date(),
    toolVersion: input.toolVersion ?? "0.1.0",
    logger: input.logger ?? consoleLogger
  };
}
