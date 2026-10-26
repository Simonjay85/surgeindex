import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveLiveDataDir } from "./paths";
import { liveFileSchema, pressFileSchema, toVnIso, type LiveFile, type LivePost, type LiveSource, type PressFile } from "./types";

/** Filesystem access for live blogs. No server-only import: the ingest script uses it too. */

const SLUG_RE = /^[a-z0-9-]+$/;

function fileFor(dir: string, slug: string, suffix = ""): string {
  if (!SLUG_RE.test(slug)) throw new Error("invalid slug");
  return path.join(dir, `${slug}${suffix}.json`);
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmp, file);
}

export function emptyLiveFile(slug: string): LiveFile {
  return { slug, updates: [], resolved: null, updated_at: null };
}

export async function readLiveFile(slug: string, dir = resolveLiveDataDir()): Promise<LiveFile> {
  try {
    const parsed = liveFileSchema.safeParse(JSON.parse(await readFile(fileFor(dir, slug), "utf8")));
    if (parsed.success) return { ...parsed.data, updates: [...parsed.data.updates].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)) };
    console.error(`[live] ${slug}.json is invalid; showing no updates`);
  } catch {
    // missing file: no updates yet
  }
  return emptyLiveFile(slug);
}

export async function readPressFile(slug: string, dir = resolveLiveDataDir()): Promise<PressFile | null> {
  try {
    const parsed = pressFileSchema.safeParse(JSON.parse(await readFile(fileFor(dir, slug, ".press"), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writePressFile(file: PressFile, dir = resolveLiveDataDir()): Promise<void> {
  await writeJsonAtomic(fileFor(dir, file.slug, ".press"), file);
}

function normSources(list: Array<string | LiveSource>): LiveSource[] {
  return list.map((s) => (typeof s === "string" ? { url: s } : s));
}

// Serialize writes inside this process (single Next.js server on the VPS).
let queue: Promise<unknown> = Promise.resolve();

/**
 * Append an update (or set the final resolution). Old updates are never
 * edited or removed; a story can be resolved once.
 */
export function appendLive(slug: string, post: LivePost, now = Date.now(), dir = resolveLiveDataDir()): Promise<LiveFile> {
  const run = queue.then(async () => {
    const current = await readLiveFile(slug, dir);
    const postedAt = toVnIso(now);
    const time = post.time ?? postedAt;
    let next: LiveFile;
    if (post.action === "resolve") {
      if (current.resolved) throw Object.assign(new Error("story already resolved"), { code: "already_resolved" });
      next = { ...current, resolved: { time, summary: post.summary, sources: normSources(post.sources), posted_at: postedAt }, updated_at: postedAt };
    } else {
      const id = `u${now.toString(36)}${current.updates.length.toString(36)}`;
      next = { ...current, updates: [{ id, time, text: post.text, sources: normSources(post.sources), posted_at: postedAt }, ...current.updates], updated_at: postedAt };
    }
    const valid = liveFileSchema.parse(next);
    await writeJsonAtomic(fileFor(dir, slug), valid);
    return valid;
  });
  queue = run.catch(() => undefined);
  return run;
}
