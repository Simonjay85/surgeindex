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
  /** Board-level metric label override (see TrendBoard.metricLabel). */
  metricLabel?: string;
  /** Short source line shown under the board. */
  attribution?: string;
  /** False when this read has no growth metric at all (heat drops the velocity term). */
  velocityAvailable?: boolean;
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
  const id = process.env.REDDIT_CLIENT_ID?.trim();
  const secret = process.env.REDDIT_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  const res = await get("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new SourceError("OAuth response did not contain an access token");
  return json.access_token;
}

export async function fetchReddit(now: number): Promise<FetchResult> {
  const errors: string[] = [];
  try {
    const token = await redditOAuthToken();
    if (token) {
      const res = await get("https://oauth.reddit.com/r/all/hot?limit=30&raw_json=1", { headers: { Authorization: `Bearer ${token}` } });
      const items = mapRedditJson(await res.json(), now);
      if (items.length) return { items, via: "reddit oauth api" };
      errors.push("oauth: no usable posts returned");
    } else {
      errors.push("oauth: approved Reddit credentials are not configured");
    }
  } catch (e) {
    errors.push(`oauth: ${(e as Error).message}`);
  }
  for (const url of ["https://www.reddit.com/r/all/hot.json?limit=30&raw_json=1", "https://old.reddit.com/r/all/hot.json?limit=30&raw_json=1"]) {
    try {
      const res = await get(url, { headers: { Accept: "application/json" } });
      const items = mapRedditJson(await res.json(), now);
      if (items.length) return { items, via: "reddit public json" };
      errors.push(`${new URL(url).host}: no usable posts returned`);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  try {
    const res = await get("https://www.reddit.com/r/all/hot/.rss?limit=30", { headers: { Accept: "application/atom+xml" } });
    const items = mapRedditRss(await res.text());
    if (items.length) return { items, via: "reddit rss (no vote counts)" };
    errors.push("rss: no usable posts returned");
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

/* ──────────────────────────── Wikipedia ──────────────────────────── */

const WIKI_UA = "SurgeIndex/1.0 (https://surgeindex.lol; hourly most-read reader)";

/** Main pages and namespaces (English and Vietnamese) that are not articles. */
const WIKI_MAIN_PAGES = new Set(["main_page", "trang_chính", "-", "undefined", "null"]);
const WIKI_NAMESPACE_RE =
  /^(special|wikipedia|portal|file|image|talk|user|user_talk|template|category|help|module|draft|mediawiki|wp|đặc_biệt|thảo_luận|thành_viên|tập_tin|hình|bản_mẫu|thể_loại|chủ_đề|cổng_thông_tin|trợ_giúp|mô_đun|dự_án|wikipedia_talk)(_talk)?:/i;
/** Adult titles that bot traffic routinely pushes up the raw chart. */
const WIKI_BLOCK_RE = /(xxx|porn|xvideos|xnxx|xhamster|hentai|\bsex\b|_sex\b|^sex_|sexual|khiêu_dâm|tình_dục|nude|nudity)/i;

interface WikiTopArticle {
  article: string;
  views: number;
  rank: number;
}

export function isWikiArticle(title: string): boolean {
  const t = title.trim();
  if (!t || WIKI_MAIN_PAGES.has(t.toLowerCase())) return false;
  if (WIKI_NAMESPACE_RE.test(t)) return false;
  if (WIKI_BLOCK_RE.test(t)) return false;
  return true;
}

export function parseWikiTop(json: unknown): WikiTopArticle[] {
  const articles = (json as { items?: Array<{ articles?: WikiTopArticle[] }> }).items?.[0]?.articles ?? [];
  return articles.filter((a) => a && typeof a.article === "string" && typeof a.views === "number" && isWikiArticle(a.article));
}

function wikiDateParts(now: number, daysBack: number): { path: string; iso: string } {
  const d = new Date(now - daysBack * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return { path: `${y}/${m}/${day}`, iso: `${y}-${m}-${day}` };
}

interface WikiPageInfo {
  ns?: number;
  title?: string;
  missing?: boolean;
  description?: string;
  thumbnail?: { source?: string };
}

/** One batched Action API call: namespace check, short description, thumbnail. Failures are tolerated. */
async function wikiPageInfo(lang: string, titles: string[]): Promise<Map<string, WikiPageInfo> | null> {
  if (!titles.length) return new Map();
  const params = new URLSearchParams({
    action: "query",
    prop: "pageimages|description",
    titles: titles.join("|"),
    pithumbsize: "240",
    format: "json",
    formatversion: "2",
    redirects: "1",
    origin: "*",
  });
  try {
    const res = await get(`https://${lang}.wikipedia.org/w/api.php?${params}`, { headers: { "User-Agent": WIKI_UA, Accept: "application/json" } });
    const json = (await res.json()) as { query?: { normalized?: Array<{ from: string; to: string }>; redirects?: Array<{ from: string; to: string }>; pages?: WikiPageInfo[] } };
    const q = json.query ?? {};
    const byTitle = new Map((q.pages ?? []).map((p) => [p.title ?? "", p]));
    const norm = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
    const redir = new Map((q.redirects ?? []).map((n) => [n.from, n.to]));
    const out = new Map<string, WikiPageInfo>();
    for (const raw of titles) {
      const n = norm.get(raw) ?? raw.replace(/_/g, " ");
      const page = byTitle.get(redir.get(n) ?? n);
      if (page) out.set(raw, page);
    }
    return out;
  } catch {
    return null;
  }
}

function stripQuery(url: string | undefined): string | undefined {
  const safe = safeHttpUrl(url);
  if (!safe) return undefined;
  const u = new URL(safe);
  u.search = "";
  return u.toString();
}

export function mapWikiArticles(lang: string, articles: WikiTopArticle[], info: Map<string, WikiPageInfo> | null): RawTrendItem[] {
  const project = `${lang}.wikipedia.org`;
  return articles
    .filter((a) => {
      const page = info?.get(a.article);
      // When the Action API answered, it is the authority on namespaces.
      return !info || !page || (page.ns === 0 && !page.missing);
    })
    .slice(0, BOARD_SIZE)
    .map((a) => {
      const page = info?.get(a.article);
      const title = a.article.replace(/_/g, " ");
      const path = encodeURIComponent(a.article).replace(/%2F/g, "/");
      return {
        id: a.article.toLowerCase(),
        title,
        url: `https://${project}/wiki/${path}`,
        discussionUrl: `https://pageviews.wmcloud.org/?project=${project}&platform=all-access&agent=user&range=latest-30&pages=${encodeURIComponent(a.article)}`,
        subtitle: page?.description ? page.description.slice(0, 160) : undefined,
        thumbnail: stripQuery(page?.thumbnail?.source),
        metric: a.views,
        velocityHint: a.views / 24,
        comments: null,
      } satisfies RawTrendItem;
    });
}

export async function fetchWikipedia(region: TrendRegion, now: number): Promise<FetchResult> {
  const lang = region === "vn" ? "vi" : "en";
  let top: WikiTopArticle[] | null = null;
  let day = "";
  for (const back of [1, 2]) {
    const { path, iso } = wikiDateParts(now, back);
    try {
      const res = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${path}`, { headers: { "User-Agent": WIKI_UA, Accept: "application/json" } });
      top = parseWikiTop(await res.json());
      day = iso;
      break;
    } catch (e) {
      // Yesterday's file lands a few hours after midnight UTC: fall back one day on 404.
      if ((e as SourceError).status !== 404 || back === 2) throw e;
    }
  }
  if (!top?.length) throw new SourceError(`Wikimedia returned no ${lang}.wikipedia articles`);
  const candidates = top.slice(0, BOARD_SIZE + 10);
  const info = await wikiPageInfo(lang, candidates.map((a) => a.article));
  const items = mapWikiArticles(lang, candidates, info);
  if (!items.length) throw new SourceError(`No ${lang}.wikipedia articles left after filtering`);
  return { items, via: `wikimedia pageviews top ${lang}.wikipedia ${day}` };
}

/* ─────────────────────────── Shopping pages ─────────────────────────── */

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SHOP_TIMEOUT_MS = 10_000;

async function getShopHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(SHOP_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new SourceError(`${new URL(url).host} responded ${res.status}`, res.status);
  return res.text();
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/* ───────────────────────────── Amazon ───────────────────────────── */

export function isAmazonRobotPage(html: string): boolean {
  return /api-services-support@amazon\.com|\/errors\/validateCaptcha|Type the characters you see in this image|Robot Check<\/title>|To discuss automated access to Amazon data/i.test(html);
}

export interface AmazonItem extends RawTrendItem {
  department: string;
  departmentRank: number;
  rankGain: number | null;
}

/**
 * Parses the department carousels on Amazon's chart landing pages
 * (/Best-Sellers/zgbs and /gp/movers-and-shakers share the markup).
 */
export function parseAmazonCarousels(html: string): AmazonItem[] {
  const out: AmazonItem[] = [];
  const sections = html.split(/<h2 class="a-carousel-heading[^"]*">/).slice(1);
  for (const section of sections) {
    const heading = stripTags(section.slice(0, section.indexOf("</h2>")));
    const department = heading.replace(/^(Best Sellers|Movers &(amp;)? Shakers|New Releases) in /i, "").trim() || heading;
    const cards = section.split(/<li aria-roledescription="slide"[^>]*>/).slice(1);
    for (const card of cards) {
      const asin = card.match(/data-asin="([A-Z0-9]{10})"/)?.[1] ?? card.match(/\/dp\/([A-Z0-9]{10})/)?.[1];
      if (!asin) continue;
      const rank = int(card.match(/class="zg-bdg-text">#?([\d,]+)</)?.[1]);
      const titleHtml = card.match(/class="[^"]*p13n-sc-truncate[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? card.match(/class="_cDEzb_p13n-sc-css-line-clamp-\d[^"]*">([\s\S]*?)<\/div>/)?.[1];
      const title = titleHtml ? stripTags(titleHtml) : decodeEntities(card.match(/<img alt="([^"]+)"/)?.[1] ?? "");
      if (!title) continue;
      const img = card.match(/<img[^>]*\ssrc="(https:\/\/[^"]+)"/)?.[1];
      const price = card.match(/p13n-sc-price[^"]*">([^<]+)</)?.[1]?.trim();
      const rating = card.match(/aria-label="([\d.]+) out of 5 stars, ([\d,]+) ratings"/);
      const pctRaw = card.match(/zg-(?:carousel|grid)-pct-change[^>]*>([\s\S]*?)<\/(?:span|div)>/)?.[1];
      const pct = pctRaw ? int(stripTags(pctRaw).match(/([\d,]+)\s*%/)?.[1]) : null;
      const tags = [price, rating ? `★ ${rating[1]} (${rating[2]})` : undefined].filter((t): t is string => Boolean(t));
      out.push({
        id: asin,
        title: title.length > 140 ? `${title.slice(0, 137).trimEnd()}…` : title,
        url: `https://www.amazon.com/dp/${asin}`,
        subtitle: `#${rank ?? "?"} in ${department}`,
        thumbnail: safeHttpUrl(img ? decodeEntities(img) : undefined),
        metric: pct,
        velocityHint: pct !== null ? pct / 24 : null,
        comments: null,
        tags: tags.length ? tags : undefined,
        department,
        departmentRank: rank ?? 99,
        rankGain: pct,
      });
    }
  }
  return out;
}

function toRaw(item: AmazonItem): RawTrendItem {
  const raw: RawTrendItem & Partial<Pick<AmazonItem, "department" | "departmentRank" | "rankGain">> = { ...item };
  delete raw.department;
  delete raw.departmentRank;
  delete raw.rankGain;
  return raw;
}

/** Movers: biggest rank gains across departments. Best Sellers: department leaders, interleaved by rank. */
export function pickAmazonTop(items: AmazonItem[], mode: "movers" | "bestsellers"): RawTrendItem[] {
  const unique = [...new Map(items.map((i) => [i.id, i])).values()];
  if (mode === "movers") {
    return unique
      .filter((i) => i.rankGain !== null)
      .sort((a, b) => (b.rankGain ?? 0) - (a.rankGain ?? 0) || a.departmentRank - b.departmentRank)
      .slice(0, BOARD_SIZE)
      .map((i) => toRaw({ ...i, subtitle: `Movers & Shakers · #${i.departmentRank} in ${i.department}` }));
  }
  const depts = [...new Set(unique.map((i) => i.department))];
  return unique
    .map((i) => ({ i, d: depts.indexOf(i.department) }))
    .sort((a, b) => a.i.departmentRank - b.i.departmentRank || a.d - b.d)
    .slice(0, BOARD_SIZE)
    .map(({ i }) => toRaw({ ...i, metric: null, velocityHint: null }));
}

export async function fetchAmazon(): Promise<FetchResult> {
  const errors: string[] = [];
  let sawRobot = false;
  for (const [mode, url] of [
    ["movers", "https://www.amazon.com/gp/movers-and-shakers"],
    ["bestsellers", "https://www.amazon.com/Best-Sellers/zgbs"],
  ] as const) {
    try {
      const html = await getShopHtml(url);
      if (isAmazonRobotPage(html)) {
        sawRobot = true;
        errors.push(`${mode}: robot check`);
        continue;
      }
      const items = pickAmazonTop(parseAmazonCarousels(html), mode);
      if (items.length >= 5) return { items, via: mode === "movers" ? "amazon.com movers & shakers" : "amazon.com best sellers (department leaders)" };
      errors.push(`${mode}: ${items.length} items parsed`);
    } catch (e) {
      errors.push(`${mode}: ${(e as Error).message}`);
    }
  }
  throw new SourceError(`Amazon ${sawRobot ? "served a robot check" : "charts unavailable"} (${errors.join("; ")})`);
}

/* ────────────────────────────── eBay ────────────────────────────── */

export function isEbayBlockPage(html: string): boolean {
  return /Pardon Our Interruption|captcha|splashui\/challenge|Checking your browser/i.test(html.slice(0, 20_000)) && !/data-listing-id=/.test(html);
}

export function parseEbayTrending(html: string): RawTrendItem[] {
  const start = html.indexOf("ebayui-dne-trending-widget");
  const scope = start >= 0 ? html.slice(start) : html;
  const tiles = scope.split(/data-listing-id="?/).slice(1);
  const seen = new Set<string>();
  const out: RawTrendItem[] = [];
  for (const tile of tiles) {
    const id = tile.match(/^(\d{6,})/)?.[1];
    if (!id || seen.has(id)) continue;
    const name = tile.match(/itemprop=["']?name["']?[^>]*>([^<]+)</)?.[1] ?? tile.match(/dne-itemtile-title[^>]*title="([^"]+)"/)?.[1];
    if (!name) continue;
    seen.add(id);
    const imgTag = tile.match(/<img\s[^>]*>/)?.[0] ?? "";
    const img = imgTag.match(/data-config-src=["']?(https:\/\/[^"'\s>]+)/)?.[1] ?? imgTag.match(/\ssrc=["']?(https:\/\/i\.ebayimg\.com[^"'\s>]+)/)?.[1];
    const price = tile.match(/itemprop=["']?price["']?(?:\s[^>]*)?>([^<]+)</)?.[1]?.trim();
    const was = tile.match(/itemtile-price-strikethrough[^>]*>([^<]+)</)?.[1]?.trim();
    const off = int(tile.match(/(\d{1,2})%\s*off/i)?.[1]);
    const shipping = tile.match(/dne-itemtile-delivery[^>]*>([^<]+)</)?.[1]?.trim();
    const sub = [price, was ? `was ${was}` : undefined].filter(Boolean).join(" · ");
    out.push({
      id,
      title: decodeEntities(name).trim(),
      url: `https://www.ebay.com/itm/${id}`,
      subtitle: sub || undefined,
      thumbnail: safeHttpUrl(img ? decodeEntities(img) : undefined),
      metric: off,
      velocityHint: null,
      comments: null,
      tags: [price, shipping].filter((t): t is string => Boolean(t)),
    });
    if (out.length >= BOARD_SIZE) break;
  }
  return out;
}

export async function fetchEbayTrending(): Promise<FetchResult> {
  const html = await getShopHtml("https://www.ebay.com/deals/trending");
  if (isEbayBlockPage(html)) throw new SourceError("eBay served a bot challenge");
  const items = parseEbayTrending(html);
  if (items.length < 5) throw new SourceError(`eBay trending markup changed (${items.length} items parsed)`);
  return { items, via: "ebay.com/deals/trending" };
}
