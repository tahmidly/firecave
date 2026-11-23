import { promises as fs } from "node:fs";
import path from "node:path";
import type { FsEntry, FsFile } from "../shared/types";

const MAX_BYTES = 256 * 1024;
const HIDDEN = new Set([".git", "node_modules", ".next", "dist", "dist-electron", "out", "__pycache__"]);

/** Roots the user picked through the folder dialog (or used in saved conversations). */
const approvedRoots = new Set<string>();

export function approveRoot(root: string): void {
  approvedRoots.add(path.resolve(root));
}

export function isApprovedRoot(root: string): boolean {
  return approvedRoots.has(path.resolve(root));
}

/** Resolve rel inside root, following symlinks, and refuse anything that escapes it. */
async function resolveInside(root: string, rel: string): Promise<string> {
  const rootAbs = path.resolve(root);
  if (!approvedRoots.has(rootAbs)) throw new Error("Folder is not an approved project");
  const rootReal = await fs.realpath(rootAbs);
  const target = path.resolve(rootReal, rel);
  const real = await fs.realpath(target);
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) throw new Error("Path escapes the project folder");
  return real;
}

export async function listDir(root: string, rel: string): Promise<FsEntry[]> {
  const dir = await resolveInside(root, rel);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => !HIDDEN.has(e.name))
    .map((e) => ({ name: e.name, rel: path.join(rel, e.name), isDir: e.isDirectory() }))
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}

export async function readFileSafe(root: string, rel: string): Promise<FsFile> {
  const file = await resolveInside(root, rel);
  const st = await fs.stat(file);
  if (!st.isFile()) throw new Error("Not a file");
  const fh = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(Math.min(st.size, MAX_BYTES));
    await fh.read(buf, 0, buf.length, 0);
    const binary = buf.includes(0);
    return { rel, content: binary ? "" : buf.toString("utf8"), truncated: st.size > MAX_BYTES, binary };
  } finally {
    await fh.close();
  }
}
