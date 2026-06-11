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
