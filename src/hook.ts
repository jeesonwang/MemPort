import { homedir } from "node:os";
import { syncMemories } from "./core.js";
import { resolveOptions } from "./paths.js";
import type { HookOutput, Logger } from "./types.js";

export interface RunSessionStartHookInput {
  projectRoot?: string | undefined;
  codexPath?: string | undefined;
  homeDir?: string | undefined;
  stdin: string;
  now?: Date | undefined;
  toolVersion?: string | undefined;
  logger?: Logger | undefined;
}

const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

export async function runSessionStartHook(input: RunSessionStartHookInput): Promise<HookOutput> {
  try {
    if (input.stdin.trim().length > 0) {
      JSON.parse(input.stdin);
    }

    const options = resolveOptions({
      cwd: process.cwd(),
      env: process.env,
      homeDir: input.homeDir ?? homedir(),
      projectRoot: input.projectRoot,
      codexPath: input.codexPath,
      silent: true,
      now: input.now,
      toolVersion: input.toolVersion,
      logger: input.logger ?? noopLogger
    });

    const result = await syncMemories(options);
    const hookSpecificOutput: NonNullable<HookOutput["hookSpecificOutput"]> = {
      hookEventName: "SessionStart",
      additionalContext: "MemPort 已同步 Codex 记忆。摘要已写入 .claude/CLAUDE.md，详细记忆位于 .claude/codex-memories/。"
    };
    if (result.skillsChanged) {
      hookSpecificOutput.reloadSkills = true;
    }

    return {
      hookSpecificOutput
    };
  } catch (error) {
    return {
      systemMessage: `MemPort 同步失败：${(error as Error).message}`
    };
  }
}
