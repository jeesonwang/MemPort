# MemPort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an npm-distributed `memport` CLI that syncs Codex memories from `~/.codex/memories/` into Claude Code project-local `.claude/` files, including SessionStart hook support and skill synchronization.

**Architecture:** The CLI is a small TypeScript/Node.js package with no runtime dependencies. `src/core.ts` orchestrates sync, `src/memory.ts` copies allowlisted memory files, `src/skills.ts` syncs Codex skills with `.memport.json` ownership markers, `src/claude-md.ts` manages the MemPort block in `CLAUDE.md`, `src/hook.ts` emits Claude Code hook JSON, and `src/init.ts` installs project-local settings. Tests use Vitest with temporary filesystem fixtures.

**Tech Stack:** TypeScript, Node.js built-in `fs/promises`, `path`, `crypto`, Vitest, npm package `bin`.

---

## File Structure

- Create: `package.json` - npm metadata, scripts, `bin` mapping, dev dependencies.
- Create: `tsconfig.json` - NodeNext TypeScript build settings.
- Create: `vitest.config.ts` - Vitest configuration.
- Create: `bin/memport` - executable Node wrapper that loads `dist/cli.js`.
- Create: `src/types.ts` - shared option/result types and `.memport.json` schema.
- Create: `src/paths.ts` - path resolution, `~` expansion, project root resolution.
- Create: `src/hash.ts` - SHA-256 helpers for files and directories.
- Create: `src/claude-md.ts` - MemPort block rendering and safe replacement in `.claude/CLAUDE.md`.
- Create: `src/memory.ts` - default allowlist matching and detailed memory staging.
- Create: `src/skills.ts` - Codex skill discovery, conflict detection, staging, and managed-directory replacement.
- Create: `src/settings.ts` - `.claude/settings.local.json` hook merge logic.
- Create: `src/core.ts` - end-to-end sync orchestration.
- Create: `src/hook.ts` - Claude Code SessionStart hook handler.
- Create: `src/init.ts` - project initialization and hook installation flow.
- Create: `src/cli.ts` - argument parser and command dispatch.
- Create: `src/index.ts` - library exports for tests and package consumers.
- Create: `tests/helpers/fs.ts` - temp directory and fixture helpers.
- Create: `tests/claude-md.test.ts` - CLAUDE.md block behavior.
- Create: `tests/memory.test.ts` - memory allowlist and directory sync behavior.
- Create: `tests/skills.test.ts` - skill sync, ownership, and conflict behavior.
- Create: `tests/settings.test.ts` - hook settings merge behavior.
- Create: `tests/core.test.ts` - complete sync integration behavior.
- Create: `tests/hook.test.ts` - hook JSON output behavior.
- Create: `tests/cli.test.ts` - CLI command parsing and subprocess smoke tests.
- Create: `README.md` - install and usage guide.
- Create: `.gitignore` - development outputs only.

## Interface Decisions

- `memport sync` defaults to current working directory as project root and `~/.codex/memories` as Codex memory root.
- `memport hook session-start` reads hook input from stdin when present, but never requires stdin for tests or direct manual execution.
- Hook stdout must be JSON only. Progress logs go to stderr or are suppressed when `--silent` is present.
- Default detailed memory allowlist is exactly:
  - `memory_summary.md`
  - `MEMORY.md`
  - `raw_memories.md`
  - `rollout_summaries/**/*.md`
- `extensions/ad_hoc/**/*.md` and `automations/**/memory.md` are not in the default allowlist.
- A project skill directory may be overwritten only when `.claude/skills/<name>/.memport.json` is valid JSON with `managedBy: "memport"` and `sourcePath` matching the current source skill directory.
- When `~/.claude/skills/<name>/SKILL.md` exists, sync still writes the project skill but reports a warning that the personal skill can shadow it.
- Directory writes use `.claude/.memport-tmp/<run-id>/` staging, then replace only MemPort-owned target directories.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `bin/memport`
- Create: `src/index.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create package metadata**

Write `package.json`:

```json
{
  "name": "memport",
  "version": "0.1.0",
  "description": "Sync Codex memories to Claude Code projects",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "memport": "./bin/memport"
  },
  "files": [
    "bin/",
    "dist/",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "prepack": "npm run build"
  },
  "keywords": [
    "claude-code",
    "codex",
    "memory",
    "cli"
  ],
  "license": "MIT",
  "engines": {
    "node": ">=20"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "sourceMap": true,
    "rootDir": "src",
    "outDir": "dist",
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Create Vitest config**

Write `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true
  }
});
```

- [ ] **Step 4: Create executable bin wrapper**

Write `bin/memport`:

```javascript
#!/usr/bin/env node
import "../dist/cli.js";
```

Run:

```bash
chmod +x bin/memport
```

Expected: command exits with status 0.

- [ ] **Step 5: Create initial library export**

Write `src/index.ts`:

```typescript
export * from "./types.js";
export * from "./core.js";
export * from "./hook.js";
export * from "./init.js";
```

This file will fail typecheck until later tasks add the referenced modules.

- [ ] **Step 6: Create development gitignore**

Write `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
*.tgz
.DS_Store
```

- [ ] **Step 7: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and npm exits with status 0.

- [ ] **Step 8: Verify scaffold failure is limited to missing modules**

Run:

```bash
npm run typecheck
```

Expected: FAIL with TypeScript errors that `src/core.ts`, `src/hook.ts`, `src/init.ts`, and `src/types.ts` cannot be found.

- [ ] **Step 9: Commit scaffold**

Run:

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts bin/memport src/index.ts .gitignore
git commit -m "chore: scaffold memport package"
```

Expected: commit succeeds when the workspace is a git repository. If this workspace is not a git repository, record the command output in the implementation notes and continue.

---

### Task 2: Shared Types, Paths, and Hashing

**Files:**
- Create: `src/types.ts`
- Create: `src/paths.ts`
- Create: `src/hash.ts`
- Create: `tests/helpers/fs.ts`

- [ ] **Step 1: Write fixture helpers**

Write `tests/helpers/fs.ts`:

```typescript
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function makeTempDir(prefix = "memport-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
```

- [ ] **Step 2: Write path and hash tests**

Create `tests/paths-hash.test.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, removeTempDir } from "./helpers/fs.js";
import { hashDirectory, hashFile } from "../src/hash.js";
import { expandHome, resolveOptions } from "../src/paths.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

describe("path helpers", () => {
  it("expands tilde paths with an explicit home directory", () => {
    expect(expandHome("~/.codex/memories", "/Users/example")).toBe("/Users/example/.codex/memories");
    expect(expandHome("/tmp/project", "/Users/example")).toBe("/tmp/project");
  });

  it("resolves project and Codex paths from options, env, and cwd", () => {
    const resolved = resolveOptions({
      cwd: "/repo",
      env: { MEMPORT_CODEX_PATH: "/memories" },
      homeDir: "/Users/example",
      projectRoot: "/project"
    });

    expect(resolved.projectRoot).toBe("/project");
    expect(resolved.codexPath).toBe("/memories");
  });
});

describe("hash helpers", () => {
  it("hashes files and directories deterministically", async () => {
    const dir = await makeTempDir();
    tempDirs.push(dir);
    await mkdir(join(dir, "nested"), { recursive: true });
    await writeFile(join(dir, "a.txt"), "A", "utf8");
    await writeFile(join(dir, "nested", "b.txt"), "B", "utf8");

    expect(await hashFile(join(dir, "a.txt"))).toMatch(/^sha256:[0-9a-f]{64}$/);
    await expect(hashDirectory(dir)).resolves.toMatch(/^sha256:[0-9a-f]{64}$/);
    await expect(hashDirectory(dir)).resolves.toBe(await hashDirectory(dir));
  });
});
```

- [ ] **Step 3: Run the tests and confirm failure**

Run:

```bash
npm test -- tests/paths-hash.test.ts
```

Expected: FAIL because `src/hash.ts` and `src/paths.ts` do not exist.

- [ ] **Step 4: Implement shared types**

Write `src/types.ts`:

```typescript
export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface SyncOptions {
  projectRoot: string;
  codexPath: string;
  updateClaudeMd: boolean;
  silent: boolean;
  homeDir: string;
  now: Date;
  toolVersion: string;
  logger: Logger;
}

export interface ResolveOptionsInput {
  cwd: string;
  env: NodeJS.ProcessEnv;
  homeDir: string;
  projectRoot?: string | undefined;
  codexPath?: string | undefined;
  updateClaudeMd?: boolean | undefined;
  silent?: boolean | undefined;
  now?: Date | undefined;
  toolVersion?: string | undefined;
  logger?: Logger | undefined;
}

export interface SyncWarning {
  code: string;
  message: string;
}

export interface SyncResult {
  memoryFilesCopied: number;
  skillsSynced: number;
  skillsChanged: boolean;
  claudeMdUpdated: boolean;
  warnings: SyncWarning[];
}

export interface MemportSkillMarker {
  managedBy: "memport";
  sourcePath: string;
  sourceHash: string;
  managedAt: string;
  toolVersion: string;
}

export interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: "SessionStart";
    reloadSkills?: boolean;
    additionalContext?: string;
  };
  systemMessage?: string;
}
```

- [ ] **Step 5: Implement path helpers**

Write `src/paths.ts`:

```typescript
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
```

- [ ] **Step 6: Implement hash helpers**

Write `src/hash.ts`:

```typescript
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files;
}

export async function hashDirectory(dirPath: string): Promise<string> {
  const digest = createHash("sha256");
  const files = await listFiles(dirPath);

  for (const file of files) {
    const fileStat = await stat(file);
    digest.update(relative(dirPath, file));
    digest.update(String(fileStat.size));
    digest.update(await readFile(file));
  }

  return `sha256:${digest.digest("hex")}`;
}
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- tests/paths-hash.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit helpers**

Run:

```bash
git add src/types.ts src/paths.ts src/hash.ts tests/helpers/fs.ts tests/paths-hash.test.ts
git commit -m "feat: add shared path and hash helpers"
```

Expected: commit succeeds when git is available.

---

### Task 3: CLAUDE.md Managed Block

**Files:**
- Create: `src/claude-md.ts`
- Create: `tests/claude-md.test.ts`

- [ ] **Step 1: Write CLAUDE.md behavior tests**

Write `tests/claude-md.test.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, readText, removeTempDir } from "./helpers/fs.js";
import { renderMemportBlock, updateClaudeMd } from "../src/claude-md.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

describe("renderMemportBlock", () => {
  it("uses HTML markers so headings inside the summary do not break replacement", () => {
    const block = renderMemportBlock("Intro\n\n## Existing Heading\nDetails", new Date("2026-06-11T07:30:00.000Z"));

    expect(block).toContain("<!-- MEMPORT:BEGIN -->");
    expect(block).toContain("# Codex Memories");
    expect(block).toContain("## Existing Heading");
    expect(block).toContain("<!-- MEMPORT:END -->");
  });
});

describe("updateClaudeMd", () => {
  it("creates CLAUDE.md when missing", async () => {
    const root = await makeTempDir();
    tempDirs.push(root);

    const result = await updateClaudeMd({
      projectRoot: root,
      summary: "Memory summary",
      now: new Date("2026-06-11T07:30:00.000Z")
    });

    expect(result.changed).toBe(true);
    expect(await readText(join(root, ".claude", "CLAUDE.md"))).toContain("Memory summary");
  });

  it("replaces only the MemPort block and preserves user content", async () => {
    const root = await makeTempDir();
    tempDirs.push(root);
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(
      join(root, ".claude", "CLAUDE.md"),
      "Before\n\n<!-- MEMPORT:BEGIN -->\nold\n<!-- MEMPORT:END -->\n\nAfter\n",
      "utf8"
    );

    await updateClaudeMd({
      projectRoot: root,
      summary: "new summary\n\n## nested heading",
      now: new Date("2026-06-11T07:30:00.000Z")
    });

    const content = await readText(join(root, ".claude", "CLAUDE.md"));
    expect(content).toContain("Before");
    expect(content).toContain("new summary");
    expect(content).toContain("## nested heading");
    expect(content).toContain("After");
    expect(content).not.toContain("old");
    expect(await readText(join(root, ".claude", "CLAUDE.md.backup"))).toContain("old");
  });

  it("refuses to write when markers are unpaired", async () => {
    const root = await makeTempDir();
    tempDirs.push(root);
    await mkdir(join(root, ".claude"), { recursive: true });
    await writeFile(join(root, ".claude", "CLAUDE.md"), "Before\n<!-- MEMPORT:BEGIN -->\n", "utf8");

    await expect(updateClaudeMd({
      projectRoot: root,
      summary: "new",
      now: new Date("2026-06-11T07:30:00.000Z")
    })).rejects.toThrow("MemPort markers are not paired");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- tests/claude-md.test.ts
```

Expected: FAIL because `src/claude-md.ts` does not exist.

- [ ] **Step 3: Implement CLAUDE.md block management**

Write `src/claude-md.ts`:

```typescript
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

> 以下记忆来自 Codex，由 MemPort 同步
> 最后同步时间：${timestamp}
> 此章节由 MemPort 管理，手动修改将在下次同步时被覆盖

${summary.trim()}

---

**查找详细记忆：**
如需查找特定主题的详细记忆，可以使用以下方式：
- 使用 grep 搜索：\`grep -r "关键词" .claude/codex-memories/\`
- 阅读索引文件：\`.claude/codex-memories/MEMORY.md\`
- 直接读取记忆文件：\`.claude/codex-memories/*.md\`
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
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- tests/claude-md.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit CLAUDE.md support**

Run:

```bash
git add src/claude-md.ts tests/claude-md.test.ts
git commit -m "feat: manage memport claude block"
```

Expected: commit succeeds when git is available.

---

### Task 4: Detailed Memory Allowlist Sync

**Files:**
- Create: `src/memory.ts`
- Create: `tests/memory.test.ts`

- [ ] **Step 1: Write memory sync tests**

Write `tests/memory.test.ts`:

```typescript
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, readText, removeTempDir, writeText, exists } from "./helpers/fs.js";
import { listAllowlistedMemoryFiles, syncDetailedMemories } from "../src/memory.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

describe("listAllowlistedMemoryFiles", () => {
  it("includes only default memory files and rollout summaries", async () => {
    const codex = await makeTempDir();
    tempDirs.push(codex);
    await writeText(join(codex, "memory_summary.md"), "summary");
    await writeText(join(codex, "MEMORY.md"), "registry");
    await writeText(join(codex, "raw_memories.md"), "raw");
    await writeText(join(codex, "rollout_summaries", "a.md"), "rollout");
    await writeText(join(codex, "extensions", "ad_hoc", "instructions.md"), "ad hoc");
    await writeText(join(codex, "automations", "abc", "memory.md"), "automation");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "skill");
    await writeText(join(codex, ".omx", "state.json"), "{}");

    await expect(listAllowlistedMemoryFiles(codex)).resolves.toEqual([
      "MEMORY.md",
      "memory_summary.md",
      "raw_memories.md",
      "rollout_summaries/a.md"
    ]);
  });
});

describe("syncDetailedMemories", () => {
  it("copies allowlisted files into .claude/codex-memories through staging", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "summary");
    await writeText(join(codex, "rollout_summaries", "a.md"), "rollout");

    const result = await syncDetailedMemories({
      projectRoot: root,
      codexPath: codex,
      runId: "run-1"
    });

    expect(result.filesCopied).toBe(2);
    await expect(readText(join(root, ".claude", "codex-memories", "memory_summary.md"))).resolves.toBe("summary");
    await expect(readText(join(root, ".claude", "codex-memories", "rollout_summaries", "a.md"))).resolves.toBe("rollout");
    await expect(exists(join(root, ".claude", ".memport-tmp", "run-1"))).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- tests/memory.test.ts
```

Expected: FAIL because `src/memory.ts` does not exist.

- [ ] **Step 3: Implement allowlist sync**

Write `src/memory.ts`:

```typescript
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

async function walk(root: string, current = root): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(current, entry.name);
    const rel = relative(root, absolute).split(sep).join("/");
    const top = rel.split("/")[0] ?? "";
    if (entry.isDirectory()) {
      if (DENY_DIRS.has(top)) continue;
      files.push(...await walk(root, absolute));
    } else if (entry.isFile() && isAllowlistedMemoryFile(rel)) {
      files.push(rel);
    }
  }

  return files;
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
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- tests/memory.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit detailed memory sync**

Run:

```bash
git add src/memory.ts tests/memory.test.ts
git commit -m "feat: sync allowlisted codex memories"
```

Expected: commit succeeds when git is available.

---

### Task 5: Codex Skills Sync

**Files:**
- Create: `src/skills.ts`
- Create: `tests/skills.test.ts`

- [ ] **Step 1: Write skill sync tests**

Write `tests/skills.test.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exists, makeTempDir, readText, removeTempDir, writeText } from "./helpers/fs.js";
import { discoverCodexSkills, syncSkills } from "../src/skills.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

describe("discoverCodexSkills", () => {
  it("finds only direct child directories with SKILL.md", async () => {
    const codex = await makeTempDir();
    tempDirs.push(codex);
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
    await writeText(join(codex, "skills", "not-a-skill", "README.md"), "no");

    await expect(discoverCodexSkills(codex)).resolves.toMatchObject([
      { name: "demo" }
    ]);
  });
});

describe("syncSkills", () => {
  it("copies skills with support files and writes .memport.json", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\nBody");
    await writeText(join(codex, "skills", "demo", "scripts", "run.sh"), "echo demo");
    await writeText(join(codex, "skills", "demo", ".DS_Store"), "noise");

    const result = await syncSkills({
      projectRoot: root,
      codexPath: codex,
      homeDir: join(root, "home"),
      runId: "run-1",
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0"
    });

    expect(result.synced).toBe(1);
    expect(result.changed).toBe(true);
    await expect(readText(join(root, ".claude", "skills", "demo", "SKILL.md"))).resolves.toContain("Body");
    await expect(readText(join(root, ".claude", "skills", "demo", "scripts", "run.sh"))).resolves.toBe("echo demo");
    await expect(exists(join(root, ".claude", "skills", "demo", ".DS_Store"))).resolves.toBe(false);
    const marker = JSON.parse(await readText(join(root, ".claude", "skills", "demo", ".memport.json")));
    expect(marker.managedBy).toBe("memport");
    expect(marker.sourcePath).toBe(join(codex, "skills", "demo"));
    expect(marker.sourceHash).toMatch(/^sha256:/);
  });

  it("does not overwrite non-MemPort project skills", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(root, ".claude", "skills", "demo", "SKILL.md"), "project skill");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "codex skill");

    const result = await syncSkills({
      projectRoot: root,
      codexPath: codex,
      homeDir: join(root, "home"),
      runId: "run-1",
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0"
    });

    expect(result.synced).toBe(0);
    expect(result.warnings[0]?.code).toBe("PROJECT_SKILL_CONFLICT");
    await expect(readText(join(root, ".claude", "skills", "demo", "SKILL.md"))).resolves.toBe("project skill");
  });

  it("warns when a personal skill can shadow the synced project skill", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    const home = await makeTempDir();
    tempDirs.push(root, codex, home);
    await writeText(join(home, ".claude", "skills", "demo", "SKILL.md"), "personal");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "codex");

    const result = await syncSkills({
      projectRoot: root,
      codexPath: codex,
      homeDir: home,
      runId: "run-1",
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0"
    });

    expect(result.synced).toBe(1);
    expect(result.warnings[0]?.code).toBe("PERSONAL_SKILL_SHADOWS_PROJECT_SKILL");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- tests/skills.test.ts
```

Expected: FAIL because `src/skills.ts` does not exist.

- [ ] **Step 3: Implement skill discovery and sync**

Write `src/skills.ts`:

```typescript
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
    const sourceHash = await hashDirectory(skill.sourcePath);
    const nextMarker: MemportSkillMarker = {
      managedBy: "memport",
      sourcePath: skill.sourcePath,
      sourceHash,
      managedAt: input.now.toISOString(),
      toolVersion: input.toolVersion
    };
    await writeFile(join(staged, ".memport.json"), `${JSON.stringify(nextMarker, null, 2)}\n`, "utf8");

    const previousHash = marker?.sourceHash;
    if (previousHash !== sourceHash) {
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
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- tests/skills.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit skills sync**

Run:

```bash
git add src/skills.ts tests/skills.test.ts
git commit -m "feat: sync codex skills"
```

Expected: commit succeeds when git is available.

---

### Task 6: Core Sync Orchestration

**Files:**
- Create: `src/core.ts`
- Create: `tests/core.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write complete sync integration tests**

Write `tests/core.test.ts`:

```typescript
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, readText, removeTempDir, writeText, exists } from "./helpers/fs.js";
import { syncMemories } from "../src/core.js";
import type { Logger } from "../src/types.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

function testLogger(messages: string[]): Logger {
  return {
    info: (message) => messages.push(`info:${message}`),
    warn: (message) => messages.push(`warn:${message}`),
    error: (message) => messages.push(`error:${message}`)
  };
}

describe("syncMemories", () => {
  it("syncs summary, detailed memories, and skills", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    const messages: string[] = [];
    await writeText(join(codex, "memory_summary.md"), "summary\n\n## heading");
    await writeText(join(codex, "MEMORY.md"), "registry");
    await writeText(join(codex, "rollout_summaries", "one.md"), "rollout");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\nBody");

    const result = await syncMemories({
      projectRoot: root,
      codexPath: codex,
      updateClaudeMd: true,
      silent: false,
      homeDir: join(root, "home"),
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0",
      logger: testLogger(messages)
    });

    expect(result.memoryFilesCopied).toBe(3);
    expect(result.skillsSynced).toBe(1);
    expect(result.skillsChanged).toBe(true);
    expect(result.claudeMdUpdated).toBe(true);
    await expect(readText(join(root, ".claude", "CLAUDE.md"))).resolves.toContain("summary");
    await expect(readText(join(root, ".claude", "codex-memories", "MEMORY.md"))).resolves.toBe("registry");
    await expect(readText(join(root, ".claude", "skills", "demo", "SKILL.md"))).resolves.toContain("Body");
    await expect(exists(join(root, ".claude", "codex-memories", "extensions", "ad_hoc", "instructions.md"))).resolves.toBe(false);
  });

  it("fails clearly when memory_summary.md is empty", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "   \n");

    await expect(syncMemories({
      projectRoot: root,
      codexPath: codex,
      updateClaudeMd: true,
      silent: true,
      homeDir: join(root, "home"),
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0",
      logger: testLogger([])
    })).rejects.toThrow("memory_summary.md is empty");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- tests/core.test.ts
```

Expected: FAIL because `src/core.ts` does not exist.

- [ ] **Step 3: Implement core orchestration**

Write `src/core.ts`:

```typescript
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
```

- [ ] **Step 4: Keep index exports consistent**

Ensure `src/index.ts` contains:

```typescript
export * from "./types.js";
export * from "./core.js";
export * from "./hook.js";
export * from "./init.js";
```

This file will still fail until `src/hook.ts` and `src/init.ts` exist.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- tests/core.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit core sync**

Run:

```bash
git add src/core.ts src/index.ts tests/core.test.ts
git commit -m "feat: orchestrate memory sync"
```

Expected: commit succeeds when git is available.

---

### Task 7: Claude Code SessionStart Hook

**Files:**
- Create: `src/hook.ts`
- Create: `tests/hook.test.ts`

- [ ] **Step 1: Write hook tests**

Write `tests/hook.test.ts`:

```typescript
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir, removeTempDir, writeText } from "./helpers/fs.js";
import { runSessionStartHook } from "../src/hook.js";
import type { Logger } from "../src/types.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

describe("runSessionStartHook", () => {
  it("returns reloadSkills when sync writes or updates skills", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "summary");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");

    const output = await runSessionStartHook({
      projectRoot: root,
      codexPath: codex,
      homeDir: join(root, "home"),
      stdin: JSON.stringify({ hook_event_name: "SessionStart" }),
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0",
      logger: silentLogger
    });

    expect(output.hookSpecificOutput?.hookEventName).toBe("SessionStart");
    expect(output.hookSpecificOutput?.reloadSkills).toBe(true);
    expect(output.hookSpecificOutput?.additionalContext).toContain("MemPort 已同步 Codex 记忆");
  });

  it("returns systemMessage instead of throwing on sync failure", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);

    const output = await runSessionStartHook({
      projectRoot: root,
      codexPath: codex,
      homeDir: join(root, "home"),
      stdin: "",
      now: new Date("2026-06-11T07:30:00.000Z"),
      toolVersion: "0.1.0",
      logger: silentLogger
    });

    expect(output.systemMessage).toContain("MemPort 同步失败");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- tests/hook.test.ts
```

Expected: FAIL because `src/hook.ts` does not exist.

- [ ] **Step 3: Implement hook handler**

Write `src/hook.ts`:

```typescript
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
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- tests/hook.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit hook support**

Run:

```bash
git add src/hook.ts tests/hook.test.ts
git commit -m "feat: add session start hook"
```

Expected: commit succeeds when git is available.

---

### Task 8: Hook Settings Installation

**Files:**
- Create: `src/settings.ts`
- Create: `src/init.ts`
- Create: `tests/settings.test.ts`

- [ ] **Step 1: Write settings merge tests**

Write `tests/settings.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- tests/settings.test.ts
```

Expected: FAIL because `src/settings.ts` does not exist.

- [ ] **Step 3: Implement settings merge**

Write `src/settings.ts`:

```typescript
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

  const alreadyInstalled = JSON.stringify(sessionStart).includes(input.hookCommand);
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
```

- [ ] **Step 4: Implement init command logic**

Write `src/init.ts`:

```typescript
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
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- tests/settings.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit init and settings**

Run:

```bash
git add src/settings.ts src/init.ts tests/settings.test.ts
git commit -m "feat: install claude session hook"
```

Expected: commit succeeds when git is available.

---

### Task 9: CLI Command Dispatch

**Files:**
- Create: `src/cli.ts`
- Create: `tests/cli.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write CLI tests**

Write `tests/cli.test.ts`:

```typescript
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTempDir, readText, removeTempDir, writeText } from "./helpers/fs.js";
import { runCli } from "../src/cli.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map(removeTempDir));
  tempDirs = [];
});

describe("runCli", () => {
  it("runs sync with explicit paths", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "summary");

    const exitCode = await runCli([
      "sync",
      "--project-root",
      root,
      "--codex-path",
      codex
    ], {
      cwd: root,
      env: {},
      homeDir: join(root, "home"),
      stdout: vi.fn(),
      stderr: vi.fn()
    });

    expect(exitCode).toBe(0);
    await expect(readText(join(root, ".claude", "CLAUDE.md"))).resolves.toContain("summary");
  });

  it("prints hook JSON only to stdout", async () => {
    const root = await makeTempDir();
    const codex = await makeTempDir();
    tempDirs.push(root, codex);
    await writeText(join(codex, "memory_summary.md"), "summary");
    await writeText(join(codex, "skills", "demo", "SKILL.md"), "skill");
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runCli([
      "hook",
      "session-start",
      "--project-root",
      root,
      "--codex-path",
      codex,
      "--silent"
    ], {
      cwd: root,
      env: {},
      homeDir: join(root, "home"),
      stdin: "{}",
      stdout,
      stderr
    });

    expect(exitCode).toBe(0);
    expect(() => JSON.parse(stdout.mock.calls[0][0])).not.toThrow();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("returns non-zero for unknown commands", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = await runCli(["unknown"], {
      cwd: "/tmp",
      env: {},
      homeDir: "/tmp/home",
      stdout,
      stderr
    });

    expect(exitCode).toBe(1);
    expect(stderr.mock.calls[0][0]).toContain("Unknown command");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- tests/cli.test.ts
```

Expected: FAIL because `src/cli.ts` does not exist.

- [ ] **Step 3: Implement CLI parser and dispatch**

Write `src/cli.ts`:

```typescript
import { readFile } from "node:fs/promises";
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
    return await readFile(0, "utf8");
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
```

- [ ] **Step 4: Export CLI utilities for tests**

Ensure `src/index.ts` contains:

```typescript
export * from "./types.js";
export * from "./core.js";
export * from "./hook.js";
export * from "./init.js";
export * from "./cli.js";
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- tests/cli.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run all tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 7: Commit CLI**

Run:

```bash
git add src/cli.ts src/index.ts tests/cli.test.ts
git commit -m "feat: add memport cli"
```

Expected: commit succeeds when git is available.

---

### Task 10: Packaging, README, and Manual Verification

**Files:**
- Create: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Write README**

Write `README.md`:

```markdown
# MemPort

MemPort syncs local Codex memories from `~/.codex/memories/` into a Claude Code project.

## Install

```bash
npm install -g memport
```

One-shot sync is also supported:

```bash
npx memport sync
```

## Commands

```bash
memport init
memport sync
memport hook session-start --project-root "$CLAUDE_PROJECT_DIR" --silent
```

`memport init` creates `.claude/`, installs a project-local SessionStart hook in `.claude/settings.local.json`, and runs one sync.

`memport sync` writes:

- `.claude/CLAUDE.md`
- `.claude/codex-memories/`
- `.claude/skills/<skill-name>/`

## Default Memory Scope

MemPort syncs these detailed memory files by default:

- `memory_summary.md`
- `MEMORY.md`
- `raw_memories.md`
- `rollout_summaries/**/*.md`

It does not sync `extensions/ad_hoc/**/*.md` or `automations/**/memory.md` by default.

## Skill Conflict Rules

MemPort only overwrites project skills that contain a valid `.memport.json` marker with `managedBy: "memport"` and a matching `sourcePath`.

If `~/.claude/skills/<skill-name>/SKILL.md` exists, Claude Code may prefer that personal skill over the project skill. MemPort still syncs the project skill and prints a warning.

## Recommended Project Ignore Rules

```gitignore
.claude/codex-memories/
.claude/CLAUDE.md.backup
.claude/settings.local.json
```

Do not ignore the entire `.claude/skills/` directory when the project uses team-shared skills.
```

- [ ] **Step 2: Verify package metadata**

Ensure `package.json` has:

```json
{
  "bin": {
    "memport": "./bin/memport"
  },
  "files": [
    "bin/",
    "dist/",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "prepack": "npm run build"
  }
}
```

- [ ] **Step 3: Build package**

Run:

```bash
npm run build
```

Expected: PASS and `dist/cli.js` exists.

- [ ] **Step 4: Pack package**

Run:

```bash
npm pack
```

Expected: PASS and a `memport-0.1.0.tgz` file is created.

- [ ] **Step 5: Smoke test packed CLI in a temporary project**

Run:

```bash
TMP_PROJECT="$(mktemp -d)"
TMP_HOME="$(mktemp -d)"
mkdir -p "$TMP_HOME/.codex/memories/skills/demo"
printf 'summary\n' > "$TMP_HOME/.codex/memories/memory_summary.md"
printf 'registry\n' > "$TMP_HOME/.codex/memories/MEMORY.md"
printf '%s\n' '---' 'name: demo' 'description: Demo skill' '---' 'Use this skill.' > "$TMP_HOME/.codex/memories/skills/demo/SKILL.md"
HOME="$TMP_HOME" node ./dist/cli.js sync --project-root "$TMP_PROJECT" --codex-path "$TMP_HOME/.codex/memories"
test -f "$TMP_PROJECT/.claude/CLAUDE.md"
test -f "$TMP_PROJECT/.claude/codex-memories/MEMORY.md"
test -f "$TMP_PROJECT/.claude/skills/demo/SKILL.md"
test -f "$TMP_PROJECT/.claude/skills/demo/.memport.json"
```

Expected: every command exits with status 0.

- [ ] **Step 6: Smoke test hook JSON**

Run:

```bash
HOOK_OUTPUT="$(HOME="$TMP_HOME" node ./dist/cli.js hook session-start --project-root "$TMP_PROJECT" --codex-path "$TMP_HOME/.codex/memories" --silent < /dev/null)"
node -e 'const data = JSON.parse(process.argv[1]); if (!data.hookSpecificOutput || data.hookSpecificOutput.hookEventName !== "SessionStart") process.exit(1)' "$HOOK_OUTPUT"
```

Expected: command exits with status 0 and hook stdout is valid JSON.

- [ ] **Step 7: Run final verification**

Run:

```bash
npm test
npm run typecheck
npm run build
npm pack
```

Expected: all commands PASS.

- [ ] **Step 8: Commit docs and packaging**

Run:

```bash
git add README.md package.json package-lock.json bin/memport
git commit -m "docs: document memport cli usage"
```

Expected: commit succeeds when git is available.

---

## Self-Review Checklist

- [ ] Spec coverage: npm CLI, `init`, `sync`, `hook session-start`, detailed memory allowlist, skills sync, `.memport.json`, conflict handling, `reloadSkills`, and project-local hook installation each map to at least one task.
- [ ] Default allowlist does not include `extensions/ad_hoc/**/*.md`.
- [ ] Default allowlist does not include `automations/**/memory.md`.
- [ ] Hook stdout is JSON-only in silent mode.
- [ ] Non-MemPort project skills are not overwritten.
- [ ] Personal same-name skills produce a warning.
- [ ] Directory sync uses staging under `.claude/.memport-tmp/<run-id>/`.
- [ ] `CLAUDE.md` uses HTML marker replacement, not Markdown heading boundaries.
- [ ] No step relies on Claude Code plugin marketplace distribution.
- [ ] Final verification includes `npm test`, `npm run typecheck`, `npm run build`, and `npm pack`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-11-memport-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.
