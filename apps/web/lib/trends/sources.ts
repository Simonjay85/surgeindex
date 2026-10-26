/**
 * Source fetchers for the Top 10 boards. Each returns RawTrendItem[] or throws
 * a SourceError. No dependencies beyond fetch: XML and HTML are parsed with
 * small, defensive regexes to keep the hourly job light on memory.
 */
import type { RawTrendItem, TrendRegion } from "./types";

export const USER_AGENT = "SurgeIndexTrends/1.0 (+https://surgeindex.lol/methodology; hourly public-chart reader)";
const TIMEOUT_MS = 15_000;
const BOARD_SIZE = 10;

export class SourceError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SourceError";
  }
}

export interface FetchResult {
  items: RawTrendItem[];
  via: string;
}

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new SourceError(`${new URL(url).host} responded ${res.status}`, res.status);
  return res;
}

export function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1]!.trim()) : undefined;
}

function ageHours(iso: string | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0.5, (now - t) / 3_600_000);
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/* ───────────────────────────── Reddit ───────────────────────────── */

interface RedditPost {
  id: string;
  title: string;
  subreddit_name_prefixed: string;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  url: string;
  thumbnail?: string;
  over_18?: boolean;
  stickied?: boolean;
  is_self?: boolean;
  domain?: string;
  preview?: { images?: Array<{ source?: { url?: string }; resolutions?: Array<{ url: string; width: number }> }> };
}

function redditThumb(p: RedditPost): string | undefined {
  const res = p.preview?.images?.[0]?.resolutions;
  const pick = res?.find((r) => r.width >= 216) ?? res?.[res.length - 1];
  return safeHttpUrl(pick?.url ?? (p.thumbnail?.startsWith("http") ? p.thumbnail : undefined));
}

function mapRedditJson(json: unknown, now: number): RawTrendItem[] {
  const children = (json as { data?: { children?: Array<{ data: RedditPost }> } }).data?.children ?? [];
  return children
    .map((c) => c.data)
    .filter((p) => p && !p.stickied && !p.over_18)
    .slice(0, BOARD_SIZE)
    .map((p) => {
      const published = new Date(p.created_utc * 1000).toISOString();
      const age = ageHours(published, now) ?? 1;
      return {
        id: p.id,
        title: decodeEntities(p.title),
        url: p.is_self ? `https://www.reddit.com${p.permalink}` : safeHttpUrl(p.url) ?? `https://www.reddit.com${p.permalink}`,
        discussionUrl: `https://www.reddit.com${p.permalink}`,
        subtitle: p.subreddit_name_prefixed,
        author: `u/${p.author}`,
        thumbnail: redditThumb(p),
        metric: p.score,
        velocityHint: p.score / age,
        publishedAt: published,
        comments: p.num_comments,
        tags: p.domain && !p.is_self ? [p.domain] : undefined,
      } satisfies RawTrendItem;
    });
}

function mapRedditRss(xml: string): RawTrendItem[] {
  const entries = xml.split("<entry>").slice(1);
  return entries.slice(0, BOARD_SIZE + 2).map((entry) => {
    const id = (tag(entry, "id") ?? "").replace(/^t3_/, "");
    const link = entry.match(/<link href="([^"]+)"/)?.[1];
    const sub = entry.match(/<category[^>]*label="([^"]+)"/)?.[1];
    const thumb = entry.match(/<media:thumbnail url="([^"]+)"/)?.[1];
    const published = tag(entry, "published") ?? tag(entry, "updated");
    return {
      id,
      title: tag(entry, "title") ?? "Untitled",
      url: safeHttpUrl(link ? decodeEntities(link) : undefined) ?? "https://www.reddit.com/r/all/",
      discussionUrl: safeHttpUrl(link ? decodeEntities(link) : undefined),
      subtitle: sub ? decodeEntities(sub) : undefined,
      author: tag(entry, "name")?.replace(/^\/u\//, "u/"),
      thumbnail: safeHttpUrl(thumb ? decodeEntities(thumb) : undefined),
      metric: null,
      velocityHint: null,
      publishedAt: published,
      comments: null,
    } satisfies RawTrendItem;
  }).filter((i) => i.id && !/\bnsfw\b/i.test(i.title)).slice(0, BOARD_SIZE);
}

async function redditOAuthToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await get("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

export async function fetchReddit(now: number): Promise<FetchResult> {
  const errors: string[] = [];
  try {
    const token = await redditOAuthToken();
    if (token) {
      const res = await get("https://oauth.reddit.com/r/all/hot?limit=30&raw_json=1", { headers: { Authorization: `Bearer ${token}` } });
      const items = mapRedditJson(await res.json(), now);
      if (items.length) return { items, via: "reddit oauth api" };
    }
  } catch (e) {
    errors.push(`oauth: ${(e as Error).message}`);
  }
  for (const url of ["https://www.reddit.com/r/all/hot.json?limit=30&raw_json=1", "https://old.reddit.com/r/all/hot.json?limit=30&raw_json=1"]) {
    try {
      const res = await get(url, { headers: { Accept: "application/json" } });
      const items = mapRedditJson(await res.json(), now);
      if (items.length) return { items, via: "reddit public json" };
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  try {
    const res = await get("https://www.reddit.com/r/all/hot/.rss?limit=30", { headers: { Accept: "application/atom+xml" } });
    const items = mapRedditRss(await res.text());
    if (items.length) return { items, via: "reddit rss (no vote counts)" };
  } catch (e) {
    errors.push(`rss: ${(e as Error).message}`);
  }
  throw new SourceError(`Reddit unavailable (${errors.join("; ")})`);
}

/* ─────────────────────────── Hacker News ─────────────────────────── */

interface HnItem {
  id: number;
  type: string;
  title?: string;
  url?: string;
  score?: number;
  by?: string;
  time?: number;
  descendants?: number;
  dead?: boolean;
  deleted?: boolean;
}

export async function fetchHackerNews(now: number): Promise<FetchResult> {
  const ids = (await (await get("https://hacker-news.firebaseio.com/v0/topstories.json")).json()) as number[];
  const candidates = ids.slice(0, 14);
  const items = await Promise.all(
    candidates.map(async (id) => {
      try {
        return (await (await get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)).json()) as HnItem | null;
      } catch {
        return null;
      }
    }),
  );
  const out = items
    .filter((i): i is HnItem => Boolean(i && i.type === "story" && i.title && !i.dead && !i.deleted))
    .slice(0, BOARD_SIZE)
    .map((i) => {
      const published = i.time ? new Date(i.time * 1000).toISOString() : undefined;
      const age = ageHours(published, now) ?? 1;
      const discussion = `https://news.ycombinator.com/item?id=${i.id}`;
      let domain: string | undefined;
      try {
        domain = i.url ? new URL(i.url).hostname.replace(/^www\./, "") : undefined;
      } catch {
        domain = undefined;
      }
      return {
        id: String(i.id),
        title: i.title!,
        url: safeHttpUrl(i.url) ?? discussion,
        discussionUrl: discussion,
        subtitle: domain ?? "news.ycombinator.com",
        author: i.by,
        metric: i.score ?? 0,
        velocityHint: (i.score ?? 0) / age,
        publishedAt: published,
        comments: i.descendants ?? 0,
        tags: domain ? [domain] : undefined,
      } satisfies RawTrendItem;
    });
  if (!out.length) throw new SourceError("Hacker News returned no stories");
  return { items: out, via: "hacker news firebase api" };
}

/* ────────────────────────── Google Trends ────────────────────────── */

function parseTraffic(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.replace(/,/g, "").match(/([\d.]+)\s*([KkMm])?/);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  const mult = m[2]?.toLowerCase() === "m" ? 1_000_000 : m[2]?.toLowerCase() === "k" ? 1_000 : 1;
  return Math.round(n * mult);
}

export async function fetchGoogleTrends(region: TrendRegion, now: number): Promise<FetchResult> {
  const geo = region === "vn" ? "VN" : "US";
  const xml = await (await get(`https://trends.google.com/trending/rss?geo=${geo}`, { headers: { Accept: "application/rss+xml" } })).text();
  const parsed = xml
    .split("<item>")
    .slice(1)
    .map((chunk) => {
      const title = tag(chunk, "title") ?? "";
      const traffic = parseTraffic(tag(chunk, "ht:approx_traffic"));
      const pub = tag(chunk, "pubDate");
      const publishedAt = pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : undefined;
      const age = ageHours(publishedAt, now) ?? 1;
      const news = chunk.split("<ht:news_item>").slice(1, 2)[0];
      const newsTitle = news ? tag(news, "ht:news_item_title") : undefined;
      const newsUrl = news ? safeHttpUrl(tag(news, "ht:news_item_url")) : undefined;
      const newsSource = news ? tag(news, "ht:news_item_source") : undefined;
      return {
        id: title.toLowerCase().replace(/\s+/g, " ").trim(),
        title,
        url: `https://www.google.com/search?q=${encodeURIComponent(title)}`,
        discussionUrl: `https://trends.google.com/trends/explore?q=${encodeURIComponent(title)}&geo=${geo}&date=now%201-d`,
        subtitle: newsSource ? `via ${newsSource}` : `Trending in ${region === "vn" ? "Vietnam" : "the US"}`,
        thumbnail: safeHttpUrl(tag(chunk, "ht:picture")),
        metric: traffic,
        velocityHint: traffic !== null ? traffic / Math.max(1, age) : null,
        publishedAt,
        context: newsTitle,
        contextUrl: newsUrl,
      } satisfies RawTrendItem;
    })
    .filter((i) => i.title);
  if (!parsed.length) throw new SourceError(`Google Trends ${geo} feed was empty`);
  // The feed is ordered by recency; rank by approximate volume, then freshness.
  parsed.sort((a, b) => (b.metric ?? 0) - (a.metric ?? 0) || Date.parse(b.publishedAt ?? "0") - Date.parse(a.publishedAt ?? "0"));
  return { items: parsed.slice(0, BOARD_SIZE), via: `google trends rss geo=${geo}` };
}

/* ─────────────────────────── GitHub Trending ─────────────────────────── */

function int(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value.replace(/[^\d]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

export async function fetchGitHubTrending(): Promise<FetchResult> {
  const html = await (await get("https://github.com/trending?since=daily", { headers: { Accept: "text/html" } })).text();
  const articles = html.split('<article class="Box-row">').slice(1);
  const items = articles.slice(0, BOARD_SIZE).map((a) => {
    const body = a.split("</article>")[0] ?? a;
    const href = body.match(/<h2[^>]*>[\s\S]*?href="\/([^"/]+\/[^"/]+)"/)?.[1];
    const desc = body.match(/<p class="col-9[^"]*">([\s\S]*?)<\/p>/)?.[1];
    const lang = body.match(/itemprop="programmingLanguage">([^<]+)</)?.[1];
    const stars = int(body.match(/\/stargazers"[^>]*>(?:\s*<svg[\s\S]*?<\/svg>)?\s*([\d,]+)/)?.[1]);
    const forks = int(body.match(/\/forks"[^>]*>(?:\s*<svg[\s\S]*?<\/svg>)?\s*([\d,]+)/)?.[1]);
    const today = int(body.match(/([\d,]+)\s+stars?\s+today/)?.[1]);
    if (!href) return null;
    const [owner, repo] = href.split("/");
    return {
      id: href.toLowerCase(),
      title: `${owner} / ${repo}`,
      url: `https://github.com/${href}`,
      discussionUrl: `https://github.com/${href}`,
      subtitle: desc ? decodeEntities(desc.replace(/<[^>]+>/g, "").trim()).slice(0, 180) : undefined,
      author: owner,
      thumbnail: `https://avatars.githubusercontent.com/${owner}?s=96`,
      metric: today,
      velocityHint: today !== null ? today / 24 : null,
      comments: null,
      tags: [lang?.trim(), stars !== null ? `★ ${stars.toLocaleString("en-US")}` : undefined, forks !== null ? `${forks.toLocaleString("en-US")} forks` : undefined].filter((t): t is string => Boolean(t)),
    } satisfies RawTrendItem;
  }).filter((i): i is NonNullable<typeof i> => i !== null);
  if (!items.length) throw new SourceError("GitHub trending markup changed or was empty");
  return { items, via: "github.com/trending (daily)" };
}

/* ───────────────────────────── YouTube ───────────────────────────── */

interface YtVideo {
  id: string;
  snippet: { title: string; channelTitle: string; publishedAt: string; thumbnails?: Record<string, { url: string; width?: number }> };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

export function youtubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY?.trim());
}

export async function fetchYouTube(region: TrendRegion, now: number): Promise<FetchResult> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new SourceError("YOUTUBE_API_KEY is not configured");
  const regionCode = region === "vn" ? "VN" : "US";
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&maxResults=${BOARD_SIZE}&key=${encodeURIComponent(key)}`;
  let json: { items?: YtVideo[] };
  try {
    json = (await (await get(url, { headers: { Accept: "application/json" } })).json()) as { items?: YtVideo[] };
  } catch (e) {
    // Never echo the request URL: it contains the API key.
    throw new SourceError(`YouTube API request failed (${(e as SourceError).status ?? "network"})`);
  }
  const items = (json.items ?? []).map((v) => {
    const views = v.statistics?.viewCount ? Number(v.statistics.viewCount) : null;
    const age = ageHours(v.snippet.publishedAt, now) ?? 1;
    const thumbs = v.snippet.thumbnails ?? {};
    const thumb = thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url;
    return {
      id: v.id,
      title: v.snippet.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      discussionUrl: `https://www.youtube.com/watch?v=${v.id}`,
      subtitle: v.snippet.channelTitle,
      author: v.snippet.channelTitle,
      thumbnail: safeHttpUrl(thumb),
      metric: views,
      velocityHint: views !== null ? views / age : null,
      publishedAt: v.snippet.publishedAt,
      comments: v.statistics?.commentCount ? Number(v.statistics.commentCount) : null,
    } satisfies RawTrendItem;
  });
  if (!items.length) throw new SourceError(`YouTube returned no videos for ${regionCode}`);
  return { items, via: `youtube data api v3 regionCode=${regionCode}` };
}
