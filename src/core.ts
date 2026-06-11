import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { updateClaudeMd } from "./claude-md.js";
import { syncDetailedMemories } from "./memory.js";
import { syncSkills } from "./skills.js";
import type { SyncOptions, SyncResult } from "./types.js";

async function ensureCodexDirectory(codexPath: string): Promise<void> {
  try {
    const info = await stat(codexPath);
    if (!info.isDirectory()) throw new Error(`${codexPath} is not a directory`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Codex memory directory does not exist: ${codexPath}`);
    }
    throw error;
  }
}

async function readSummary(codexPath: string): Promise<string> {
  const summaryPath = join(codexPath, "memory_summary.md");
  const summary = await readFile(summaryPath, "utf8");
  if (summary.trim().length === 0) {
    throw new Error("memory_summary.md is empty");
  }
  return summary;
}

export async function syncMemories(options: SyncOptions): Promise<SyncResult> {
  await ensureCodexDirectory(options.codexPath);
  await mkdir(join(options.projectRoot, ".claude"), { recursive: true });

  const runId = `run-${options.now.getTime()}-${Math.random().toString(16).slice(2)}`;
  const summary = await readSummary(options.codexPath);
  if (!options.silent) options.logger.info("读取 Codex 记忆摘要");

  const detailed = await syncDetailedMemories({
    projectRoot: options.projectRoot,
    codexPath: options.codexPath,
    runId
  });
  if (!options.silent) options.logger.info(`复制 ${detailed.filesCopied} 个记忆文件到 .claude/codex-memories/`);

  const skills = await syncSkills({
    projectRoot: options.projectRoot,
    codexPath: options.codexPath,
    homeDir: options.homeDir,
    runId,
    now: options.now,
    toolVersion: options.toolVersion
  });

  for (const warning of skills.warnings) {
    options.logger.warn(warning.message);
  }
  if (!options.silent) options.logger.info(`同步 ${skills.synced} 个 Codex skills 到 .claude/skills/`);

  let claudeMdUpdated = false;
  if (options.updateClaudeMd) {
    const claude = await updateClaudeMd({
      projectRoot: options.projectRoot,
      summary,
      now: options.now
    });
    claudeMdUpdated = claude.changed;
    if (!options.silent) options.logger.info("更新 .claude/CLAUDE.md");
  }

  return {
    memoryFilesCopied: detailed.filesCopied,
    skillsSynced: skills.synced,
    skillsChanged: skills.changed,
    claudeMdUpdated,
    warnings: skills.warnings
  };
}
