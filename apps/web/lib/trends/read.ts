import "server-only";

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { bundledTrendsDataDir, DAILY_DIR, LATEST_FILE, resolveTrendsDataDir } from "./paths";
import { boardId, primaryRegion, TREND_SOURCES, type TrendBoard, type TrendItem, type TrendRegion, type TrendSnapshot, type TrendSource } from "./types";

async function readSnapshot(file: string): Promise<TrendSnapshot | null> {
  try {
    const data = JSON.parse(await readFile(file, "utf8")) as TrendSnapshot;
    return data && Array.isArray(data.boards) ? data : null;
  } catch {
    return null;
  }
}

function dataDirs(): string[] {
  const primary = resolveTrendsDataDir();
  const bundled = bundledTrendsDataDir();
  return primary === bundled ? [primary] : [primary, bundled];
}

/** Latest snapshot. Falls back to the bundled seed when the data dir is empty. */
export const getLatestSnapshot = cache(async (): Promise<TrendSnapshot | null> => {
  for (const dir of dataDirs()) {
    const snap = await readSnapshot(path.join(dir, LATEST_FILE));
    if (snap) return snap;
  }
  return null;
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isArchiveDate(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export const getDailySnapshot = cache(async (date: string): Promise<TrendSnapshot | null> => {
  if (!isArchiveDate(date)) return null;
  for (const dir of dataDirs()) {
    const snap = await readSnapshot(path.join(dir, DAILY_DIR, `${date}.json`));
    if (snap) return snap;
  }
  return null;
});

/** Archive dates (newest first) across the data dir and bundled seed. */
export const listArchiveDates = cache(async (): Promise<string[]> => {
  const dates = new Set<string>();
  for (const dir of dataDirs()) {
    try {
      for (const f of await readdir(path.join(dir, DAILY_DIR))) {
        const d = f.replace(/\.json$/, "");
        if (isArchiveDate(d)) dates.add(d);
      }
    } catch {
      // directory missing: nothing archived there yet
    }
  }
  return [...dates].sort().reverse();
});

export function findBoard(snapshot: TrendSnapshot | null, source: TrendSource, region: TrendRegion = "global"): TrendBoard | undefined {
  return snapshot?.boards.find((b) => b.id === boardId(source, region));
}

export interface FeaturedItem {
  item: TrendItem;
  board: TrendBoard;
}

/** #1 item of every live global board, in registry order (for the ticker). */
export function leadersOf(snapshot: TrendSnapshot | null, region: TrendRegion = "global"): FeaturedItem[] {
  const out: FeaturedItem[] = [];
  for (const meta of TREND_SOURCES) {
    const board = findBoard(snapshot, meta.key, meta.regions.includes(region) ? region : primaryRegion(meta));
    const first = board?.items[0];
    if (board && first) out.push({ item: first, board });
  }
  return out;
}

/** Hottest items across every board, at most one per board. */
export function hottestAcross(snapshot: TrendSnapshot | null, limit = 3): FeaturedItem[] {
  const best: FeaturedItem[] = [];
  for (const board of snapshot?.boards ?? []) {
    if (board.region !== "global" || !board.items.length) continue;
    const top = [...board.items].sort((a, b) => b.heat - a.heat)[0]!;
    best.push({ item: top, board });
  }
  return best.sort((a, b) => b.item.heat - a.item.heat).slice(0, limit);
}
