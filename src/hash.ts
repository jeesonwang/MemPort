import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export interface HashDirectoryOptions {
  shouldInclude?(relativePath: string): boolean;
}

export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

async function listFiles(root: string, options: HashDirectoryOptions, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(current, entry.name);
    const rel = relative(root, absolute).split(sep).join("/");
    if (options.shouldInclude && !options.shouldInclude(rel)) continue;

    if (entry.isDirectory()) {
      files.push(...await listFiles(root, options, absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files;
}

export async function hashDirectory(dirPath: string, options: HashDirectoryOptions = {}): Promise<string> {
  const digest = createHash("sha256");
  const files = await listFiles(dirPath, options);

  for (const file of files) {
    const fileStat = await stat(file);
    const rel = relative(dirPath, file).split(sep).join("/");
    digest.update(rel);
    digest.update(String(fileStat.size));
    digest.update(await readFile(file));
  }

  return `sha256:${digest.digest("hex")}`;
}
