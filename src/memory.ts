import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

export interface SyncDetailedMemoriesInput {
  projectRoot: string;
  codexPath: string;
  runId: string;
}

export interface SyncDetailedMemoriesResult {
  filesCopied: number;
}

const ROOT_ALLOWLIST = new Set(["memory_summary.md", "MEMORY.md", "raw_memories.md"]);
const DENY_DIRS = new Set([".git", ".omx", "skills", "extensions", "automations", "node_modules"]);

const ALLOWLIST_ORDER = ["MEMORY.md", "memory_summary.md", "raw_memories.md"];

async function walk(root: string, current = root): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const allowlistFiles: string[] = [];
  const rolloutFiles: string[] = [];

  for (const entry of entries) {
    const absolute = join(current, entry.name);
    const rel = relative(root, absolute).split(sep).join("/");
    const top = rel.split("/")[0] ?? "";
    if (entry.isDirectory()) {
      if (DENY_DIRS.has(top)) continue;
      const dirFiles = await walk(root, absolute);
      for (const file of dirFiles) {
        if (file.startsWith("rollout_summaries/")) {
          rolloutFiles.push(file);
        } else {
          allowlistFiles.push(file);
        }
      }
    } else if (entry.isFile() && isAllowlistedMemoryFile(rel)) {
      if (rel.startsWith("rollout_summaries/")) {
        rolloutFiles.push(rel);
      } else {
        allowlistFiles.push(rel);
      }
    }
  }

  const sortedAllowlist = allowlistFiles.sort((a, b) => {
    const indexA = ALLOWLIST_ORDER.indexOf(a);
    const indexB = ALLOWLIST_ORDER.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  return [...sortedAllowlist, ...rolloutFiles.sort()];
}

export function isAllowlistedMemoryFile(relativePath: string): boolean {
  if (ROOT_ALLOWLIST.has(relativePath)) return true;
  return relativePath.startsWith("rollout_summaries/") && relativePath.endsWith(".md");
}

export async function listAllowlistedMemoryFiles(codexPath: string): Promise<string[]> {
  return walk(codexPath);
}

export async function syncDetailedMemories(input: SyncDetailedMemoriesInput): Promise<SyncDetailedMemoriesResult> {
  const files = await listAllowlistedMemoryFiles(input.codexPath);
  const claudeDir = join(input.projectRoot, ".claude");
  const stagingRoot = join(claudeDir, ".memport-tmp", input.runId);
  const stagingMemories = join(stagingRoot, "codex-memories");
  const target = join(claudeDir, "codex-memories");
  const oldTarget = join(stagingRoot, "codex-memories.old");

  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingMemories, { recursive: true });

  for (const file of files) {
    const source = join(input.codexPath, file);
    const destination = join(stagingMemories, file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }

  const stagedFiles = await listAllowlistedMemoryFiles(stagingMemories);
  if (stagedFiles.length !== files.length) {
    throw new Error("Detailed memory staging verification failed");
  }

  await mkdir(claudeDir, { recursive: true });
  try {
    await stat(target);
    await rename(target, oldTarget);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  try {
    await rename(stagingMemories, target);
    await rm(stagingRoot, { recursive: true, force: true });
  } catch (error) {
    try {
      await stat(oldTarget);
      await rm(target, { recursive: true, force: true });
      await rename(oldTarget, target);
    } catch (rollbackError) {
      if ((rollbackError as NodeJS.ErrnoException).code !== "ENOENT") throw rollbackError;
    }
    throw error;
  }

  return { filesCopied: files.length };
}
