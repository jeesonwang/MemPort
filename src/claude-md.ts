import { mkdir, readFile, rename, rm, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";

export const MEMPORT_BEGIN = "<!-- MEMPORT:BEGIN -->";
export const MEMPORT_END = "<!-- MEMPORT:END -->";

export interface UpdateClaudeMdInput {
  projectRoot: string;
  summary: string;
  now: Date;
}

export interface UpdateClaudeMdResult {
  changed: boolean;
  path: string;
}

export function renderMemportBlock(summary: string, now: Date): string {
  const timestamp = now.toISOString();
  return `${MEMPORT_BEGIN}
# Codex Memories

> Memories below are imported from Codex and synced by MemPort.
> Last synced at: ${timestamp}
> This section is managed by MemPort; manual edits will be overwritten on the next sync.

${summary.trim()}

---

**Looking up detailed memories:**
To find detailed memories on a specific topic, you can:
- Search with grep: \`grep -r "<keyword>" .claude/codex-memories/\`
- Read the index file: \`.claude/codex-memories/MEMORY.md\`
- Read individual memory files: \`.claude/codex-memories/*.md\`
${MEMPORT_END}
`;
}

function replaceOrAppendBlock(existing: string, block: string): string {
  const begin = existing.indexOf(MEMPORT_BEGIN);
  const end = existing.indexOf(MEMPORT_END);

  if ((begin === -1) !== (end === -1)) {
    throw new Error("MemPort markers are not paired in .claude/CLAUDE.md");
  }

  if (begin === -1 && end === -1) {
    const separator = existing.trim().length > 0 ? "\n\n" : "";
    return `${existing.replace(/\s*$/, "")}${separator}${block}`;
  }

  const endAfterMarker = end + MEMPORT_END.length;
  return `${existing.slice(0, begin)}${block.trimEnd()}${existing.slice(endAfterMarker)}`;
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function updateClaudeMd(input: UpdateClaudeMdInput): Promise<UpdateClaudeMdResult> {
  const claudeDir = join(input.projectRoot, ".claude");
  const target = join(claudeDir, "CLAUDE.md");
  const backup = join(claudeDir, "CLAUDE.md.backup");
  const tmp = join(claudeDir, "CLAUDE.md.tmp");
  await mkdir(claudeDir, { recursive: true });

  const existing = await readOptional(target);
  const next = replaceOrAppendBlock(existing, renderMemportBlock(input.summary, input.now));

  if (existing === next) {
    return { changed: false, path: target };
  }

  await writeFile(tmp, next, "utf8");
  if (existing.length > 0) {
    await copyFile(target, backup);
  }
  await rename(tmp, target);
  await rm(tmp, { force: true });
  return { changed: true, path: target };
}
