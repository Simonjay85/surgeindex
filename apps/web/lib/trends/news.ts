/**
 * "Báo VN đang nóng" — the Vietnamese news board.
 *
 * Every hour we read the public RSS feeds of major Vietnamese outlets plus
 * Google News Vietnam, cluster the same story across outlets (diacritic-free
 * title tokens + Jaccard similarity; Google News items already group related
 * coverage) and rank clusters by distinct outlets × recency decay.
 *
 * Pure module (fetch only, no fs) so the ingest job and tests share it.
 */
import type { NewsSourceLink, RawTrendItem } from "./types";

export const NEWS_USER_AGENT = "SurgeIndexTrends/1.0 (+https://surgeindex.lol/methodology; hourly public-chart reader)";
const TIMEOUT_MS = 15_000;
/** Articles older than this are ignored. */
export const NEWS_WINDOW_HOURS = 36;
/** Score halves every N hours since the cluster's latest article. */
export const NEWS_HALF_LIFE_HOURS = 6;
/** Max articles read per feed (VietNamNet ships 1,000 items per feed). */
const MAX_ITEMS_PER_FEED = 80;
export const JACCARD_THRESHOLD = 0.5;

export interface NewsFeed {
  id: string;
  /** Display name of the outlet; null for aggregators (publisher read per item). */
  outlet: string | null;
  url: string;
}

/**
 * Feeds verified from the build sandbox on 2026-10-27 (HTTP 200, fresh items).
 * Dropped: vietnamnet.vn/rss/tin-moi-nhat.rss (404), znews.vn/rss/tin-moi.rss
 * (404), znews.vn/rss/thoi-su.rss (200 but frozen since Nov 2025).
 */
export const NEWS_FEEDS: NewsFeed[] = [
  { id: "vnexpress-moi", outlet: "VnExpress", url: "https://vnexpress.net/rss/tin-moi-nhat.rss" },
  { id: "vnexpress-thoisu", outlet: "VnExpress", url: "https://vnexpress.net/rss/thoi-su.rss" },
  { id: "vnexpress-giaitri", outlet: "VnExpress", url: "https://vnexpress.net/rss/giai-tri.rss" },
  { id: "tuoitre", outlet: "Tuổi Trẻ", url: "https://tuoitre.vn/rss/tin-moi-nhat.rss" },
  { id: "thanhnien", outlet: "Thanh Niên", url: "https://thanhnien.vn/rss/home.rss" },
  { id: "dantri", outlet: "Dân Trí", url: "https://dantri.com.vn/rss/home.rss" },
  { id: "vietnamnet-thoisu", outlet: "VietNamNet", url: "https://vietnamnet.vn/rss/thoi-su.rss" },
  { id: "vietnamnet-giaitri", outlet: "VietNamNet", url: "https://vietnamnet.vn/rss/giai-tri.rss" },
  { id: "znews-xahoi", outlet: "Znews", url: "https://znews.vn/rss/xa-hoi.rss" },
  { id: "znews-giaitri", outlet: "Znews", url: "https://znews.vn/rss/giai-tri.rss" },
  { id: "google-news", outlet: null, url: "https://news.google.com/rss?hl=vi&gl=VN&ceid=VN:vi" },
];

export interface NewsArticle {
  title: string;
  url: string;
  outlet: string;
  /** ISO timestamp (UTC). */
  publishedAt: string | null;
  /** Feed id the article came from. */
  feed: string;
  /** Google News already groups related coverage: items of one group share this. */
  group?: string;
  /** True when url is the outlet's own article (not a news.google.com redirect). */
  direct: boolean;
}

/* ───────────────────────────── Text ───────────────────────────── */

export function decodeXml(input: string): string {
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

/** Lowercase, strip Vietnamese diacritics (đ → d) and punctuation. */
export function normalizeVi(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Very common syllables that carry no story identity. */
const STOPWORDS = new Set(
  "va voi cua cho la co khong mot nhung cac nguoi da dang se bi duoc tai tu trong ngoai khi thi nay do ve len ra vao nhu hon rat cung con lai sau truoc moi nhat theo tren duoi nam ngay thang gio den di ai gi sao the nao bao nhieu vi neu hay hoac ma nhieu it day kia ay o tin video anh clip live truc tiep".split(" "),
);

export function titleTokens(title: string): Set<string> {
  const words = normalizeVi(title).split(" ").filter((w) => w.length > 1 && !STOPWORDS.has(w));
  const out = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    out.add(words[i]!);
    // Vietnamese words are mostly two syllables: bigrams keep "truong giang" apart from "truong hoc".
    if (i + 1 < words.length) out.add(`${words[i]}_${words[i + 1]}`);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const t of small) if (big.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Overlap coefficient: catches a short headline fully contained in a longer one. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const t of small) if (big.has(t)) inter++;
  return inter / small.size;
}

export function sameStory(a: Set<string>, b: Set<string>): boolean {
  if (jaccard(a, b) >= JACCARD_THRESHOLD) return true;
  // Short-vs-long rewrites of one headline: demand strong containment and enough shared tokens.
  const shared = [...a].filter((t) => b.has(t)).length;
  return shared >= 6 && overlap(a, b) >= 0.7;
}

/* ───────────────────────────── Outlets ───────────────────────────── */

const OUTLET_ALIASES: Array<[RegExp, string]> = [
  [/^vnexpress/, "VnExpress"],
  [/^tuoi ?tre/, "Tuổi Trẻ"],
  [/^thanh ?nien/, "Thanh Niên"],
  [/^dan ?tri/, "Dân Trí"],
  [/^vietnamnet/, "VietNamNet"],
  [/^(znews|zing)/, "Znews"],
  [/^lao ?dong/, "Lao Động"],
  [/^tien ?phong/, "Tiền Phong"],
  [/^nguoi ?lao ?dong|^nld/, "Người Lao Động"],
  [/^vtv/, "VTV"],
  [/^vov/, "VOV"],
  [/^vietnamplus/, "VietnamPlus"],
  [/^soha/, "Soha"],
  [/^kenh ?14/, "Kenh14"],
  [/^cafef/, "CafeF"],
  [/^24h/, "24h"],
  [/^vietnam ?net/, "VietNamNet"],
  [/^nhan ?dan/, "Nhân Dân"],
  [/^cong ?an ?nhan ?dan|^cand/, "Công an Nhân dân"],
  [/^thanh ?pho ?ho ?chi ?minh|^phap ?luat tp/, "Pháp Luật TP.HCM"],
];

/** "Báo VietNamNet", "Tuổi Trẻ Online", "Laodong.vn" → one canonical outlet name. */
export function canonicalOutlet(name: string): string {
  const raw = decodeXml(name).trim();
  const key = normalizeVi(raw)
    .replace(/^(bao|tap chi|trang tin|dien tu)\s+/g, "")
    .replace(/\b(online|dien tu|vn|com)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [re, label] of OUTLET_ALIASES) if (re.test(key)) return label;
  return raw.replace(/^Báo\s+/i, "").replace(/\s+Online$/i, "").trim() || raw;
}

export function outletKey(name: string): string {
  return normalizeVi(canonicalOutlet(name)).replace(/\s+/g, "");
}

/* ───────────────────────────── Parsing ───────────────────────────── */

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1]!.trim()).trim() : undefined;
}

/** Headline text: some feeds double-encode entities (&amp;apos;) or leave inline tags. */
export function cleanTitle(value: string): string {
  let t = value;
  for (let i = 0; i < 2 && /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(t); i++) t = decodeXml(t);
  return t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** Routine daily content that is never "a story" (horoscopes, lottery results, calendars). */
const ROUTINE_RE = /\b(tu vi|xo so|xsmb|xsmn|xsmt|kqxs|lich am|lich van nien|cung hoang dao)\b/;

export function isRoutine(title: string): boolean {
  return ROUTINE_RE.test(normalizeVi(title));
}

function httpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * RSS dates seen in the wild: RFC 822 ("Mon, 26 Oct 2026 20:41:20 +0700"),
 * two-digit years ("Tue, 27 Oct 26 02:02:00 +0700", Thanh Niên) and
 * US-style local time without a zone ("10/26/2026 10:15:00 PM", Tuổi Trẻ,
 * which is Vietnam time).
 */
export function parseFeedDate(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (us) {
    let h = Number(us[4]);
    const ampm = us[7]?.toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    const iso = `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}T${String(h).padStart(2, "0")}:${us[5]}:${us[6] ?? "00"}+07:00`;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const fixedYear = v.replace(/^(\w{3},\s+\d{1,2}\s+\w{3}\s+)(\d{2})(\s)/, (_, a: string, y: string, s: string) => `${a}20${y}${s}`);
  const t = Date.parse(fixedYear);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Parse a publisher RSS feed. */
export function parseOutletRss(xml: string, feed: NewsFeed): NewsArticle[] {
  const out: NewsArticle[] = [];
  for (const chunk of xml.split(/<item[\s>]/).slice(1, MAX_ITEMS_PER_FEED + 1)) {
    const title = tag(chunk, "title");
    const url = httpUrl(tag(chunk, "link") ?? tag(chunk, "guid"));
    if (!title || !url) continue;
    out.push({ title: cleanTitle(title), url, outlet: feed.outlet ?? "", publishedAt: parseFeedDate(tag(chunk, "pubDate")), feed: feed.id, direct: true });
  }
  return out;
}

/**
 * Parse Google News: each <item> is a story group whose <description> lists
 * related coverage as <li><a href>title</a> <font>Publisher</font></li>.
 */
export function parseGoogleNews(xml: string, feed: NewsFeed): NewsArticle[] {
  const out: NewsArticle[] = [];
  for (const chunk of xml.split("<item>").slice(1, MAX_ITEMS_PER_FEED + 1)) {
    const guid = tag(chunk, "guid") ?? tag(chunk, "link") ?? "";
    const publishedAt = parseFeedDate(tag(chunk, "pubDate"));
    const group = `gn:${guid.slice(0, 40)}`;
    const desc = tag(chunk, "description") ?? "";
    const lis = [...desc.matchAll(/<li>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<font[^>]*>([\s\S]*?)<\/font>/g)];
    if (lis.length) {
      for (const m of lis) {
        const url = httpUrl(decodeXml(m[1]!));
        const title = cleanTitle(decodeXml(m[2]!));
        const outlet = decodeXml(m[3]!).replace(/<[^>]+>/g, "").trim();
        if (url && title && outlet) out.push({ title, url, outlet: canonicalOutlet(outlet), publishedAt, feed: feed.id, group, direct: false });
      }
      continue;
    }
    const full = tag(chunk, "title");
    const url = httpUrl(tag(chunk, "link"));
    const source = tag(chunk, "source");
    if (!full || !url) continue;
    const dash = full.lastIndexOf(" - ");
    const title = dash > 0 ? full.slice(0, dash).trim() : full;
    const outlet = source ?? (dash > 0 ? full.slice(dash + 3).trim() : "Google News");
    out.push({ title, url, outlet: canonicalOutlet(outlet), publishedAt, feed: feed.id, group, direct: false });
  }
  return out;
}

/* ───────────────────────────── Clustering ───────────────────────────── */

export interface NewsCluster {
  id: string;
  headline: string;
  url: string;
  outlets: number;
  sources: NewsSourceLink[];
  firstSeen: string;
  latest: string;
  score: number;
}

function hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Union-find clustering by Google News group and title similarity. */
export function clusterArticles(articles: NewsArticle[], now: number): NewsCluster[] {
  const fresh = articles.filter((a) => {
    if (isRoutine(a.title)) return false;
    if (!a.publishedAt) return true;
    const age = (now - Date.parse(a.publishedAt)) / 3_600_000;
    return age <= NEWS_WINDOW_HOURS && age >= -1;
  });
  // One entry per URL.
  const byUrl = new Map<string, NewsArticle>();
  for (const a of fresh) if (!byUrl.has(a.url)) byUrl.set(a.url, a);
  const list = [...byUrl.values()];
  const tokens = list.map((a) => titleTokens(a.title));
  const parent = list.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const groups = new Map<string, number>();
  list.forEach((a, i) => {
    if (!a.group) return;
    const first = groups.get(a.group);
    if (first === undefined) groups.set(a.group, i);
    else union(first, i);
  });

  // Inverted index on bigram tokens keeps the pairwise pass small.
  const index = new Map<string, number[]>();
  tokens.forEach((set, i) => {
    for (const t of set) {
      if (!t.includes("_")) continue;
      const arr = index.get(t);
      if (arr) arr.push(i);
      else index.set(t, [i]);
    }
  });
  const checked = new Set<string>();
  for (const ids of index.values()) {
    if (ids.length > 60) continue; // a bigram this common is not story-specific
    for (let x = 0; x < ids.length; x++) {
      for (let y = x + 1; y < ids.length; y++) {
        const i = ids[x]!;
        const j = ids[y]!;
        const key = `${i}:${j}`;
        if (checked.has(key)) continue;
        checked.add(key);
        if (sameStory(tokens[i]!, tokens[j]!)) union(i, j);
      }
    }
  }

  const members = new Map<number, number[]>();
  list.forEach((_, i) => {
    const r = find(i);
    const arr = members.get(r);
    if (arr) arr.push(i);
    else members.set(r, [i]);
  });

  const clusters: NewsCluster[] = [];
  for (const ids of members.values()) {
    const arts = ids.map((i) => list[i]!);
    // Best link per outlet: its own article beats a Google News redirect, then earliest.
    const perOutlet = new Map<string, NewsArticle>();
    for (const a of arts) {
      const k = outletKey(a.outlet);
      if (!k) continue;
      const cur = perOutlet.get(k);
      if (!cur || (a.direct && !cur.direct) || (a.direct === cur.direct && (a.publishedAt ?? "9") < (cur.publishedAt ?? "9"))) perOutlet.set(k, a);
    }
    const sources = [...perOutlet.values()]
      .sort((a, b) => Number(b.direct) - Number(a.direct) || (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""))
      .map((a) => ({ outlet: canonicalOutlet(a.outlet), url: a.url, title: a.title, publishedAt: a.publishedAt ?? undefined }));
    if (!sources.length) continue;
    const times = arts.map((a) => (a.publishedAt ? Date.parse(a.publishedAt) : NaN)).filter((t) => !Number.isNaN(t));
    const firstT = times.length ? Math.min(...times) : now;
    const latestT = times.length ? Math.max(...times) : now;
    const lead = sources.find((s) => !s.url.includes("news.google.com")) ?? sources[0]!;
    const ageH = Math.max(0, (now - latestT) / 3_600_000);
    const score = sources.length * Math.pow(0.5, ageH / NEWS_HALF_LIFE_HOURS);
    clusters.push({
      id: `n${hash(normalizeVi(lead.title))}`,
      headline: lead.title,
      url: lead.url,
      outlets: sources.length,
      sources,
      firstSeen: new Date(firstT).toISOString(),
      latest: new Date(latestT).toISOString(),
      score: Math.round(score * 100) / 100,
    });
  }
  return clusters.sort((a, b) => b.score - a.score || b.outlets - a.outlets || b.latest.localeCompare(a.latest));
}

/** Keep cluster identity (id, first seen) across hourly runs when coverage overlaps. */
export function carryOver(clusters: NewsCluster[], previous: Array<Pick<RawTrendItem, "id" | "publishedAt" | "sources">>): NewsCluster[] {
  const prevByUrl = new Map<string, { id: string; firstSeen?: string }>();
  for (const p of previous) for (const s of p.sources ?? []) prevByUrl.set(s.url, { id: p.id, firstSeen: p.publishedAt });
  const used = new Set<string>();
  return clusters.map((c) => {
    const hit = c.sources.map((s) => prevByUrl.get(s.url)).find((h) => h && !used.has(h.id));
    if (!hit) return c;
    used.add(hit.id);
    const firstSeen = hit.firstSeen && hit.firstSeen < c.firstSeen ? hit.firstSeen : c.firstSeen;
    return { ...c, id: hit.id, firstSeen };
  });
}

/** "21:05 27/10" in Vietnam time. */
export function formatVnTime(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`;
}

export function clusterToRaw(c: NewsCluster): RawTrendItem {
  return {
    id: c.id,
    title: c.headline,
    url: c.url,
    subtitle: c.sources.map((s) => s.outlet).slice(0, 6).join(" · "),
    metric: c.outlets,
    velocityHint: c.score,
    publishedAt: c.firstSeen,
    sources: c.sources.slice(0, 12),
    tags: c.sources.slice(0, 3).map((s) => s.outlet),
  };
}

/* ───────────────────────────── Fetch ───────────────────────────── */

export interface NewsFetchReport {
  feed: string;
  ok: boolean;
  items: number;
  error?: string;
}

export async function fetchFeedArticles(feed: NewsFeed): Promise<NewsArticle[]> {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": NEWS_USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml, */*" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${new URL(feed.url).host} responded ${res.status}`);
  let xml = await res.text();
  // VietNamNet ships ~1 MB feeds; only the first items matter.
  if (xml.length > 400_000) xml = xml.slice(0, 400_000);
  return feed.outlet ? parseOutletRss(xml, feed) : parseGoogleNews(xml, feed);
}

/** Read every feed sequentially; a failing feed is reported, never fatal. */
export async function fetchAllNews(feeds: NewsFeed[] = NEWS_FEEDS): Promise<{ articles: NewsArticle[]; reports: NewsFetchReport[] }> {
  const articles: NewsArticle[] = [];
  const reports: NewsFetchReport[] = [];
  for (const feed of feeds) {
    try {
      const items = await fetchFeedArticles(feed);
      articles.push(...items);
      reports.push({ feed: feed.id, ok: items.length > 0, items: items.length, ...(items.length ? {} : { error: "no items" }) });
    } catch (e) {
      reports.push({ feed: feed.id, ok: false, items: 0, error: (e as Error).message });
    }
  }
  return { articles, reports };
}
