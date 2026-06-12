import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hashDirectory } from "./hash.js";
import type { MemportSkillMarker, SyncWarning } from "./types.js";

export interface CodexSkill {
  name: string;
  sourcePath: string;
}

export interface SyncSkillsInput {
  projectRoot: string;
  codexPath: string;
  homeDir: string;
  runId: string;
  now: Date;
  toolVersion: string;
}

export interface SyncSkillsResult {
  synced: number;
  changed: boolean;
  warnings: SyncWarning[];
}

const SKIP_NAMES = new Set([".git", ".DS_Store", "node_modules", "__pycache__"]);
const MARKER_NAME = ".memport.json";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function discoverCodexSkills(codexPath: string): Promise<CodexSkill[]> {
  const skillsRoot = join(codexPath, "skills");
  let entries;
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const skills: CodexSkill[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || SKIP_NAMES.has(entry.name)) continue;
    const sourcePath = join(skillsRoot, entry.name);
    if (await pathExists(join(sourcePath, "SKILL.md"))) {
      skills.push({ name: entry.name, sourcePath });
    }
  }

  return skills;
}

async function readMarker(path: string): Promise<MemportSkillMarker | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<MemportSkillMarker>;
    if (parsed.managedBy === "memport" && typeof parsed.sourcePath === "string") {
      return parsed as MemportSkillMarker;
    }
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

async function copySkillSource(source: string, destination: string): Promise<void> {
  await cp(source, destination, {
    recursive: true,
    filter: (sourcePath) => {
      const name = sourcePath.split(/[\\/]/).pop() ?? "";
      return !SKIP_NAMES.has(name) && !name.endsWith(".tmp");
    }
  });
}

function shouldHashSkillOutput(relativePath: string): boolean {
  const parts = relativePath.split("/");
  return !parts.some((part) => SKIP_NAMES.has(part) || part === MARKER_NAME || part.endsWith(".tmp"));
}

export async function syncSkills(input: SyncSkillsInput): Promise<SyncSkillsResult> {
  const skills = await discoverCodexSkills(input.codexPath);
  const claudeDir = join(input.projectRoot, ".claude");
  const projectSkillsRoot = join(claudeDir, "skills");
  const stagingRoot = join(claudeDir, ".memport-tmp", input.runId, "skills");
  const warnings: SyncWarning[] = [];
  let synced = 0;
  let changed = false;

  await mkdir(projectSkillsRoot, { recursive: true });
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });

  for (const skill of skills) {
    const target = join(projectSkillsRoot, skill.name);
    const markerPath = join(target, ".memport.json");
    const targetExists = await pathExists(target);
    const marker = await readMarker(markerPath);

    if (targetExists && (!marker || marker.sourcePath !== skill.sourcePath)) {
      warnings.push({
        code: "PROJECT_SKILL_CONFLICT",
        message: `.claude/skills/${skill.name} exists and is not managed by MemPort`
      });
      continue;
    }

    const personalSkillPath = join(input.homeDir, ".claude", "skills", skill.name, "SKILL.md");
    if (await pathExists(personalSkillPath)) {
      warnings.push({
        code: "PERSONAL_SKILL_SHADOWS_PROJECT_SKILL",
        message: `~/.claude/skills/${skill.name}/SKILL.md exists; Claude Code personal skills can shadow project skills`
      });
    }

    const staged = join(stagingRoot, skill.name);
    await copySkillSource(skill.sourcePath, staged);
    const sourceHash = await hashDirectory(staged, { shouldInclude: shouldHashSkillOutput });
    const nextMarker: MemportSkillMarker = {
      managedBy: "memport",
      sourcePath: skill.sourcePath,
      sourceHash,
      managedAt: input.now.toISOString(),
      toolVersion: input.toolVersion
    };
    await writeFile(join(staged, ".memport.json"), `${JSON.stringify(nextMarker, null, 2)}\n`, "utf8");

    const previousHash = marker?.sourceHash;
    const targetHash = targetExists ? await hashDirectory(target, { shouldInclude: shouldHashSkillOutput }) : null;
    if (previousHash !== sourceHash || targetHash !== sourceHash) {
      const oldTarget = join(stagingRoot, `${skill.name}.old`);
      if (targetExists) {
        await rename(target, oldTarget);
      }
      try {
        await rename(staged, target);
      } catch (error) {
        if (targetExists) {
          await rm(target, { recursive: true, force: true });
          await rename(oldTarget, target);
        }
        throw error;
      }
      changed = true;
    } else {
      await rm(staged, { recursive: true, force: true });
    }

    synced += 1;
  }

  await rm(join(claudeDir, ".memport-tmp", input.runId), { recursive: true, force: true });
  return { synced, changed, warnings };
}
