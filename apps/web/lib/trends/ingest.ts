/**
 * Hourly trend ingestion. Fetches every board sequentially (low memory),
 * compares with the previous snapshot for movement, velocity and rank history,
 * scores heat, and writes JSON snapshots:
 *
 *   <dir>/latest.json                 current snapshot
 *   <dir>/history/YYYY-MM-DDTHH.json  hourly history (pruned after 7 days)
 *   <dir>/daily/YYYY-MM-DD.json       last snapshot of each UTC day (archive pages)
 */
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeTrendHeat, type TrendPlatform } from "@surge/scoring";
import { formatAge, formatCompact } from "./format";
import { DAILY_DIR, HISTORY_DIR, LATEST_FILE } from "./paths";
import {
  fetchGitHubTrending,
  fetchGoogleTrends,
  fetchHackerNews,
  fetchReddit,
  fetchYouTube,
  youtubeConfigured,
  type FetchResult,
} from "./sources";
import { boardId, type Movement, type RawTrendItem, type TrendBoard, type TrendItem, type TrendRegion, type TrendSnapshot, type TrendSource } from "./types";

const HISTORY_RETENTION_HOURS = 7 * 24;
const RANK_HISTORY_POINTS = 24;
const OFF_BOARD_RANK = 11;
const LOCK_STALE_MS = 15 * 60_000;

interface BoardSpec {
  source: TrendSource;
  region: TrendRegion;
  fetch?: (now: number) => Promise<FetchResult>;
  soonNote?: string;
}

function boardSpecs(): BoardSpec[] {
  const yt = youtubeConfigured();
  return [
    { source: "google-trends", region: "global", fetch: (now) => fetchGoogleTrends("global", now) },
    { source: "google-trends", region: "vn", fetch: (now) => fetchGoogleTrends("vn", now) },
    yt
      ? { source: "youtube", region: "global", fetch: (now) => fetchYouTube("global", now) }
      : { source: "youtube", region: "global", soonNote: "YouTube Data API key not configured yet." },
    yt
      ? { source: "youtube", region: "vn", fetch: (now) => fetchYouTube("vn", now) }
      : { source: "youtube", region: "vn", soonNote: "YouTube Data API key not configured yet." },
    { source: "reddit", region: "global", fetch: (now) => fetchReddit(now) },
    { source: "hackernews", region: "global", fetch: (now) => fetchHackerNews(now) },
    { source: "github", region: "global", fetch: () => fetchGitHubTrending() },
    { source: "x", region: "global", soonNote: "X trends need the paid X API — planned for Phase 3." },
  ];
}

function movementOf(prevRank: number | null, rank: number, hadPrevBoard: boolean): Movement {
  if (prevRank === null) return hadPrevBoard ? "new" : "none";
  if (prevRank > rank) return "up";
  if (prevRank < rank) return "down";
  return "same";
}

function whyLine(source: TrendSource, item: RawTrendItem, ctx: { movement: Movement; prevRank: number | null; rank: number; velocity: number | null; measured: boolean; now: number }): string {
  const parts: string[] = [];
  const age = formatAge(item.publishedAt, ctx.now);
  if (ctx.movement === "new") parts.push("New on the board");
  else if (ctx.movement === "up" && ctx.prevRank !== null) parts.push(`Climbed ${ctx.prevRank - ctx.rank} spot${ctx.prevRank - ctx.rank === 1 ? "" : "s"} since the last update`);
  const v = ctx.velocity !== null && ctx.velocity > 0 ? formatCompact(ctx.velocity) : null;
  switch (source) {
    case "reddit":
      if (v) parts.push(`+${v} upvotes/hr`);
      if (item.comments) parts.push(`${formatCompact(item.comments)} comments`);
      if (!v && age) parts.push(`#${ctx.rank} on r/all, posted ${age} ago`);
      break;
    case "hackernews":
      if (v) parts.push(`${v} points/hr`);
      if (item.comments) parts.push(`${formatCompact(item.comments)} comments`);
      if (age) parts.push(`posted ${age} ago`);
      break;
    case "google-trends":
      if (item.metric) parts.push(`${formatCompact(item.metric)}+ searches`);
      if (age) parts.push(`started trending ${age} ago`);
      break;
    case "github":
      if (item.metric) parts.push(`+${formatCompact(item.metric)} stars today`);
      if (item.tags?.[0] && !item.tags[0].startsWith("★")) parts.push(item.tags[0]);
      break;
    case "youtube":
      if (v) parts.push(`${v} views/hr`);
      if (age) parts.push(`published ${age} ago`);
      break;
    default:
      break;
  }
  if (!parts.length) parts.push(`#${ctx.rank} on ${source === "reddit" ? "r/all" : "the chart"} right now`);
  return parts.slice(0, 3).join(" · ");
}

export function buildBoard(spec: BoardSpec, result: FetchResult, prev: TrendBoard | undefined, now: number): TrendBoard {
  const prevItems = new Map((prev?.items ?? []).map((i) => [i.id, i]));
  const prevFetched = prev?.fetchedAt ? Date.parse(prev.fetchedAt) : null;
  const hoursSincePrev = prevFetched ? (now - prevFetched) / 3_600_000 : null;
  const hadPrevBoard = Boolean(prev && prev.items.length && prev.status !== "soon");
  const size = result.items.length;
  const items: TrendItem[] = result.items.map((raw, index) => {
    const rank = index + 1;
    const before = prevItems.get(raw.id);
    const prevRank = before?.rank ?? null;
    const movement = movementOf(prevRank, rank, hadPrevBoard);
    let velocity: number | null = raw.velocityHint ?? null;
    let measured = false;
    if (before && before.metric !== null && raw.metric !== null && hoursSincePrev !== null && hoursSincePrev >= 0.25 && hoursSincePrev <= 6 && raw.metric >= before.metric && spec.source !== "google-trends" && spec.source !== "github") {
      velocity = (raw.metric - before.metric) / hoursSincePrev;
      measured = true;
    }
    const history = before ? [...before.rankHistory] : hadPrevBoard ? [OFF_BOARD_RANK] : [];
    history.push(rank);
    const heat = computeTrendHeat({
      platform: spec.source as TrendPlatform,
      velocityPerHour: velocity,
      rank,
      boardSize: size,
      rankDelta: prevRank === null ? null : prevRank - rank,
      isNew: movement === "new",
      velocityAvailable: !result.items.every((i) => i.metric === null),
    }).score;
    return {
      ...raw,
      rank,
      prevRank,
      movement,
      rankHistory: history.slice(-RANK_HISTORY_POINTS),
      velocityPerHour: velocity !== null ? Math.round(velocity * 10) / 10 : null,
      velocityMeasured: measured,
      heat,
      why: whyLine(spec.source, raw, { movement, prevRank, rank, velocity, measured, now }),
    };
  });
  return { id: boardId(spec.source, spec.region), source: spec.source, region: spec.region, status: "live", fetchedAt: new Date(now).toISOString(), via: result.via, items };
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, file);
}

async function acquireLock(dir: string): Promise<() => Promise<void>> {
  const lock = path.join(dir, ".ingest.lock");
  try {
    const s = await stat(lock);
    if (Date.now() - s.mtimeMs < LOCK_STALE_MS) throw new Error(`Another ingest is running (lock ${lock}). Exiting.`);
    await unlink(lock);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  await writeFile(lock, String(process.pid), { flag: "wx" });
  return async () => {
    await rm(lock, { force: true });
  };
}

async function pruneHistory(dir: string, now: number): Promise<number> {
  const historyDir = path.join(dir, HISTORY_DIR);
  let removed = 0;
  let files: string[] = [];
  try {
    files = await readdir(historyDir);
  } catch {
    return 0;
  }
  for (const f of files) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})\.json$/);
    if (!m) continue;
    const t = Date.parse(`${m[1]}T${m[2]}:00:00Z`);
    if (now - t > HISTORY_RETENTION_HOURS * 3_600_000) {
      await rm(path.join(historyDir, f), { force: true });
      removed++;
    }
  }
  return removed;
}

export interface IngestLog {
  board: string;
  status: TrendBoard["status"];
  items: number;
  via?: string;
  error?: string;
}

export async function runIngest(dir: string, log: (line: string) => void = console.log): Promise<{ snapshot: TrendSnapshot; results: IngestLog[] }> {
  await mkdir(dir, { recursive: true });
  const release = await acquireLock(dir);
  try {
    const now = Date.now();
    const previous = await readJson<TrendSnapshot>(path.join(dir, LATEST_FILE));
    const prevBoards = new Map((previous?.boards ?? []).map((b) => [b.id, b]));
    const boards: TrendBoard[] = [];
    const results: IngestLog[] = [];

    for (const spec of boardSpecs()) {
      const id = boardId(spec.source, spec.region);
      const prev = prevBoards.get(id);
      if (!spec.fetch) {
        boards.push({ id, source: spec.source, region: spec.region, status: "soon", fetchedAt: null, note: spec.soonNote, items: [] });
        results.push({ board: id, status: "soon", items: 0 });
        continue;
      }
      try {
        const result = await spec.fetch(now);
        const board = buildBoard(spec, result, prev, now);
        boards.push(board);
        results.push({ board: id, status: "live", items: board.items.length, via: result.via });
      } catch (e) {
        const message = (e as Error).message;
        if (prev && prev.items.length) {
          boards.push({ ...prev, status: "stale", note: `Latest refresh failed: ${message}. Showing the last good snapshot.` });
          results.push({ board: id, status: "stale", items: prev.items.length, error: message });
        } else {
          boards.push({ id, source: spec.source, region: spec.region, status: "unavailable", fetchedAt: null, note: message, items: [] });
          results.push({ board: id, status: "unavailable", items: 0, error: message });
        }
      }
    }

    const snapshot: TrendSnapshot = { version: 1, generatedAt: new Date(now).toISOString(), boards };
    const iso = snapshot.generatedAt;
    await writeJsonAtomic(path.join(dir, HISTORY_DIR, `${iso.slice(0, 13)}.json`), snapshot);
    await writeJsonAtomic(path.join(dir, DAILY_DIR, `${iso.slice(0, 10)}.json`), snapshot);
    await writeJsonAtomic(path.join(dir, LATEST_FILE), snapshot);
    const pruned = await pruneHistory(dir, now);

    for (const r of results) log(`[trends] ${r.board.padEnd(18)} ${r.status.padEnd(11)} ${String(r.items).padStart(2)} items${r.via ? ` via ${r.via}` : ""}${r.error ? ` — ${r.error}` : ""}`);
    log(`[trends] wrote ${path.join(dir, LATEST_FILE)} at ${iso}; pruned ${pruned} old history file(s)`);
    return { snapshot, results };
  } finally {
    await release();
  }
}
