import { homedir } from "node:os";
import { initProject } from "./init.js";
import { syncMemories } from "./core.js";
import { runSessionStartHook } from "./hook.js";
import { resolveOptions } from "./paths.js";
import type { Logger } from "./types.js";

export interface CliRuntime {
  cwd: string;
  env: NodeJS.ProcessEnv;
  homeDir: string;
  stdin?: string;
  stdout(message: string): void;
  stderr(message: string): void;
}

interface ParsedFlags {
  projectRoot?: string;
  codexPath?: string;
  silent: boolean;
  updateClaudeMd: boolean;
  installHook?: boolean;
  hookCommand?: string;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value) throw new Error(`Missing value for ${option}`);
  return value;
}

function parseFlags(args: string[]): ParsedFlags {
  const flags: ParsedFlags = {
    silent: false,
    updateClaudeMd: true
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--project-root") flags.projectRoot = requireValue(args, ++index, arg);
    else if (arg === "--codex-path") flags.codexPath = requireValue(args, ++index, arg);
    else if (arg === "--silent") flags.silent = true;
    else if (arg === "--no-claude-md") flags.updateClaudeMd = false;
    else if (arg === "--install-hook") flags.installHook = true;
    else if (arg === "--no-install-hook") flags.installHook = false;
    else if (arg === "--hook-command") flags.hookCommand = requireValue(args, ++index, arg);
    else throw new Error(`Unknown option: ${arg}`);
  }

  return flags;
}

function makeLogger(runtime: CliRuntime, silent: boolean): Logger {
  return {
    info: (message) => {
      if (!silent) runtime.stderr(`✓ ${message}\n`);
    },
    warn: (message) => runtime.stderr(`警告：${message}\n`),
    error: (message) => runtime.stderr(`错误：${message}\n`)
  };
}

async function readStdin(runtime: CliRuntime): Promise<string> {
  if (typeof runtime.stdin === "string") return runtime.stdin;
  try {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
    }
    return input;
  } catch {
    return "";
  }
}

export async function runCli(args: string[], runtime: CliRuntime): Promise<number> {
  const [command, subcommand, ...rest] = args;

  try {
    if (command === "sync") {
      const flags = parseFlags([subcommand, ...rest].filter((value): value is string => Boolean(value)));
      const options = resolveOptions({
        cwd: runtime.cwd,
        env: runtime.env,
        homeDir: runtime.homeDir,
        projectRoot: flags.projectRoot,
        codexPath: flags.codexPath,
        updateClaudeMd: flags.updateClaudeMd,
        silent: flags.silent,
        logger: makeLogger(runtime, flags.silent)
      });
      await syncMemories(options);
      if (!flags.silent) runtime.stderr("完成！Codex 记忆已同步到当前项目\n");
      return 0;
    }

    if (command === "init") {
      const flags = parseFlags([subcommand, ...rest].filter((value): value is string => Boolean(value)));
      const options = resolveOptions({
        cwd: runtime.cwd,
        env: runtime.env,
        homeDir: runtime.homeDir,
        projectRoot: flags.projectRoot,
        codexPath: flags.codexPath,
        updateClaudeMd: flags.updateClaudeMd,
        silent: flags.silent,
        logger: makeLogger(runtime, flags.silent)
      });
      await initProject({
        ...options,
        installHook: flags.installHook ?? true,
        hookCommand: flags.hookCommand ?? "memport hook session-start --project-root \"$CLAUDE_PROJECT_DIR\" --silent"
      });
      if (!flags.silent) runtime.stderr("完成！MemPort 已初始化当前项目\n");
      return 0;
    }

    if (command === "hook" && subcommand === "session-start") {
      const flags = parseFlags(rest);
      const output = await runSessionStartHook({
        projectRoot: flags.projectRoot,
        codexPath: flags.codexPath,
        homeDir: runtime.homeDir,
        stdin: await readStdin(runtime),
        logger: makeLogger(runtime, true)
      });
      runtime.stdout(`${JSON.stringify(output)}\n`);
      return 0;
    }

    runtime.stderr(`Unknown command: ${[command, subcommand].filter(Boolean).join(" ")}\n`);
    return 1;
  } catch (error) {
    runtime.stderr(`错误：${(error as Error).message}\n`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    homeDir: homedir(),
    stdout: (message) => process.stdout.write(message),
    stderr: (message) => process.stderr.write(message)
  });
  process.exitCode = exitCode;
}
