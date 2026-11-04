/**
 * Daily "Top 10 hôm nay" share images (Facebook / Threads / TikTok). Pure
 * helpers shared by the PNG route and the /vn/chia-se page: which boards can
 * be shared, their Vietnamese titles, the date line and the ready caption.
 * Nothing here posts anywhere; Aaron downloads and posts manually.
 */
import type { TrendBoard, TrendItem, TrendSnapshot } from "../trends/types";

export const SHARE_SIZE = { width: 1080, height: 1350 } as const;
export const SHARE_ROUTE = "/api/share/top10-vn.png";
export const SHARE_PAGE = "/vn/chia-se";

export type ShareLocale = "vi" | "en";

export interface ShareBoardDef {
  id: string;
  /** Copy language of the image and caption. Defaults to Vietnamese. */
  locale?: ShareLocale;
  /** Hashtags for the English caption (VN captions use a fixed set). */
  hashtags?: string[];
  /** Path of the live board on the site. */
  path: string;
  title: [string, string];
  short: string;
  source: string;
  color: string;
  /** Long titles (headlines, product names): two smaller lines instead of one. */
  twoLine?: boolean;
  metric: (item: TrendItem, board: TrendBoard) => string | null;
}

const viNumber = new Intl.NumberFormat("vi-VN");

/** "438K", "1,2 triệu", "950": short Vietnamese number. */
export function formatViCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(".", ",").replace(/,0$/, "")} triệu`;
  if (abs >= 10_000) return `${Math.round(n / 1_000)}K`;
  return viNumber.format(Math.round(n));
}

export const SHARE_BOARDS: ShareBoardDef[] = [
  {
    id: "google-trends-vn",
    path: "/top-10/google-trends",
    title: ["Top 10 người Việt", "đang tìm hôm nay"],
    short: "Google Trends",
    source: "Google Trends · Việt Nam",
    color: "#4c8dff",
    metric: (i) => (i.metric ? `${formatViCompact(i.metric)}+ lượt tìm` : null),
  },
  {
    id: "youtube-vn",
    twoLine: true,
    path: "/top-10/youtube",
    title: ["Top 10 video YouTube", "đang hot hôm nay"],
    short: "YouTube",
    source: "YouTube Thịnh hành · Việt Nam",
    color: "#ff2d46",
    metric: (i) => (i.metric ? `${formatViCompact(i.metric)} lượt xem` : null),
  },
  {
    id: "news-vn",
    twoLine: true,
    path: "/top-10/news",
    title: ["Top 10 tin báo Việt", "đang nóng hôm nay"],
    short: "Báo VN",
    source: "VnExpress, Tuổi Trẻ, Thanh Niên, Dân Trí…",
    color: "#ffb23f",
    metric: (i) => (i.metric ? `${i.metric} đầu báo` : null),
  },
  {
    id: "tiktok-shop-vn",
    twoLine: true,
    path: "/top-10/tiktok-shop",
    title: ["Top 10 TikTok Shop", "bán chạy hôm nay"],
    short: "TikTok Shop",
    source: "TikTok Shop qua AccessTrade",
    color: "#25f4ee",
    metric: (i, b) => {
      if (i.metric === null) return null;
      return b.metricLabel === "Bán thêm 24h" ? `+${formatViCompact(i.metric)} / 24h` : `${formatViCompact(i.metric)} đã bán`;
    },
  },
];

export const DEFAULT_SHARE_BOARD = SHARE_BOARDS[0]!;

export function getShareBoard(id: string | null | undefined): ShareBoardDef | undefined {
  if (!id) return DEFAULT_SHARE_BOARD;
  return SHARE_BOARDS.find((b) => b.id === id);
}

export function shareImagePath(def: ShareBoardDef): string {
  return def.id === DEFAULT_SHARE_BOARD.id ? SHARE_ROUTE : `${SHARE_ROUTE}?board=${def.id}`;
}

const WEEKDAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** Vietnam (UTC+7, no DST) calendar parts of an instant. */
function vnParts(at: number) {
  const d = new Date(at + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return { weekday: WEEKDAYS[d.getUTCDay()]!, date: `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`, time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
}

/** "Thứ Ba, 27/10/2026". */
export function vnDateLine(at: number): string {
  const v = vnParts(at);
  return `${v.weekday}, ${v.date}`;
}

/** "16:05". */
export function vnTime(at: number): string {
  return vnParts(at).time;
}

/** NFC (precomposed Vietnamese glyphs) with collapsed whitespace; case is kept as the source gives it. */
export function displayTitle(title: string): string {
  return title
    .normalize("NFC")
    .replace(/[【〔［]/g, "[")
    .replace(/[】〕］]/g, "]")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\]\s*/g, "] ")
    .trim();
}

/**
 * Keeps only what the bundled Be Vietnam Pro font can draw (Latin, Vietnamese,
 * punctuation, ₫). Anything else (CJK, emoji) would make next/og fetch extra
 * fonts from Google at render time, which the VPS cannot reach.
 */
export function imageSafeText(text: string): string {
  const kept = text
    .normalize("NFC")
    .replace(/[^\u0020-\u007E\u00A0-\u024F\u0300-\u036F\u1E00-\u1EFF\u2010-\u2027\u2030-\u205E\u20AB\u20AC]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return kept || "…";
}

/** Hard cap before the CSS ellipsis, so very long product titles never reach the renderer whole. */
export function clipTitle(title: string, max = 64): string {
  const t = displayTitle(title);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

export interface ShareData {
  def: ShareBoardDef;
  board: TrendBoard | undefined;
  items: TrendItem[];
  /** When the board was fetched (or the snapshot was generated). */
  at: number;
}

export function shareData(snapshot: TrendSnapshot | null, def: ShareBoardDef, now = Date.now()): ShareData {
  const board = snapshot?.boards.find((b) => b.id === def.id);
  const items = (board?.items ?? []).slice(0, 10);
  const stamp = board?.fetchedAt ?? snapshot?.generatedAt ?? null;
  const at = stamp && !Number.isNaN(Date.parse(stamp)) ? Date.parse(stamp) : now;
  return { def, board, items, at };
}

/** Ready-to-paste Vietnamese caption: title, numbered list, link, hashtags. */
export function shareCaption(data: ShareData, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const { def, items, at } = data;
  const lines = [`🔥 ${def.title[0]} ${def.title[1]} (${vnDateLine(at)})`, ""];
  if (!items.length) lines.push("Board đang cập nhật, quay lại sau ít phút nhé.");
  for (const item of items) {
    const metric = data.board ? def.metric(item, data.board) : null;
    lines.push(`${item.rank}. ${clipTitle(item.title, 90)}${metric ? ` (${metric})` : ""}`);
  }
  lines.push("", `Xem bảng xếp hạng cập nhật mỗi giờ: ${base}${def.path}`, `Nguồn: ${def.source}. Cập nhật lúc ${vnTime(at)} (giờ VN).`);
  if (def.id === "tiktok-shop-vn") lines.push("Link sản phẩm trên SurgeIndex là link affiliate.");
  lines.push("", "#SurgeIndex #Top10 #XuHuong");
  return lines.join("\n");
}

/* ───────────────────────── English (global boards) ───────────────────────── */

export const SHARE_ROUTE_EN = "/api/share/top10.png";
export const SHARE_PAGE_EN = "/share";

const enNumber = new Intl.NumberFormat("en-US");

/** "439K", "2.2M", "2,859": short English number. */
export function formatEnCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000)}K`;
  return enNumber.format(Math.round(n));
}

/** Cuts a secondary label (department, subreddit) to fit the metric column. */
function shortLabel(text: string | undefined, max = 24): string | null {
  if (!text) return null;
  const t = imageSafeText(displayTitle(text));
  if (t === "…") return null;
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export const SHARE_BOARDS_EN: ShareBoardDef[] = [
  {
    id: "google-trends",
    locale: "en",
    path: "/top-10/google-trends",
    title: ["Top 10 Trending", "Searches Today"],
    short: "Google Trends",
    source: "Google Trends · United States",
    color: "#4c8dff",
    hashtags: ["#Trending", "#GoogleTrends"],
    metric: (i) => (i.metric ? `${formatEnCompact(i.metric)}+ searches` : null),
  },
  {
    id: "youtube",
    locale: "en",
    twoLine: true,
    path: "/top-10/youtube",
    title: ["Top 10 on", "YouTube Today"],
    short: "YouTube",
    source: "YouTube Most Popular · United States",
    color: "#ff2d46",
    hashtags: ["#YouTube", "#TrendingVideos"],
    metric: (i) => (i.metric ? `${formatEnCompact(i.metric)} views` : null),
  },
  {
    id: "reddit",
    locale: "en",
    twoLine: true,
    path: "/top-10/reddit",
    title: ["Top 10 on", "Reddit Today"],
    short: "Reddit",
    source: "Reddit · r/all",
    color: "#ff5a1f",
    hashtags: ["#Reddit", "#Trending"],
    metric: (i) => (i.metric ? `${formatEnCompact(i.metric)} upvotes` : shortLabel(i.subtitle)),
  },
  {
    id: "hackernews",
    locale: "en",
    twoLine: true,
    path: "/top-10/hackernews",
    title: ["Top 10 on", "Hacker News Today"],
    short: "Hacker News",
    source: "Hacker News · front page",
    color: "#ff8a1f",
    hashtags: ["#HackerNews", "#Tech"],
    metric: (i) => (i.metric ? `${formatEnCompact(i.metric)} points` : null),
  },
  {
    id: "github",
    locale: "en",
    path: "/top-10/github",
    title: ["Top 10 Trending", "GitHub Repos Today"],
    short: "GitHub",
    source: "GitHub Trending · all languages",
    color: "#3fdc7a",
    hashtags: ["#GitHub", "#OpenSource"],
    metric: (i) => (i.metric ? `${formatEnCompact(i.metric)} stars today` : null),
  },
  {
    id: "wikipedia",
    locale: "en",
    path: "/top-10/wikipedia",
    title: ["Top 10 Most-Read", "on Wikipedia"],
    short: "Wikipedia",
    source: "Wikimedia pageviews · English Wikipedia",
    color: "#c8ccd4",
    hashtags: ["#Wikipedia", "#Trending"],
    metric: (i) => (i.metric ? `${formatEnCompact(i.metric)} views` : null),
  },
  {
    id: "amazon",
    locale: "en",
    twoLine: true,
    path: "/top-10/amazon",
    title: ["Top 10 Amazon", "Best Sellers"],
    short: "Amazon",
    source: "Amazon.com (US) best seller charts",
    color: "#ff9900",
    hashtags: ["#AmazonFinds", "#BestSellers"],
    metric: (i) => (i.metric ? `+${formatEnCompact(i.metric)}% rank` : shortLabel(i.subtitle?.replace(/^#\d+ in /, ""), 22)),
  },
  {
    id: "ebay",
    locale: "en",
    twoLine: true,
    path: "/top-10/ebay",
    title: ["Top 10 eBay", "Trending Deals"],
    short: "eBay",
    source: "eBay Trending Deals (US)",
    color: "#e53238",
    hashtags: ["#eBay", "#Deals"],
    metric: (i) => {
      const price = i.subtitle?.split(" · ")[0]?.trim();
      const off = i.metric ? `${Math.round(i.metric)}% off` : null;
      const p = price && /^\$[\d,.]+$/.test(price) ? price : null;
      return p && off ? `${p} · ${off}` : (p ?? off);
    },
  },
];

export const DEFAULT_SHARE_BOARD_EN = SHARE_BOARDS_EN[0]!;

/** English boards only: a VN id here is unknown (404). */
export function getShareBoardEn(id: string | null | undefined): ShareBoardDef | undefined {
  if (!id) return DEFAULT_SHARE_BOARD_EN;
  return SHARE_BOARDS_EN.find((b) => b.id === id);
}

export function shareImagePathEn(def: ShareBoardDef): string {
  return def.id === DEFAULT_SHARE_BOARD_EN.id ? SHARE_ROUTE_EN : `${SHARE_ROUTE_EN}?board=${def.id}`;
}

/** US Eastern calendar parts of an instant (DST-aware). */
function etParts(at: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const mm = String(months.indexOf(get("month")) + 1).padStart(2, "0");
  return { weekday: get("weekday"), month: get("month"), day: get("day"), year: get("year"), time: `${get("hour")}:${get("minute")}`, iso: `${get("year")}-${mm}-${get("day").padStart(2, "0")}` };
}

/** "Tuesday, October 27, 2026" (US Eastern). */
export function etDateLine(at: number): string {
  const e = etParts(at);
  return `${e.weekday}, ${e.month} ${e.day}, ${e.year}`;
}

/** "08:05" (US Eastern, 24h). */
export function etTime(at: number): string {
  return etParts(at).time;
}

/** "2026-10-27" (US Eastern), for download file names. */
export function etIsoDate(at: number): string {
  return etParts(at).iso;
}

/**
 * English image titles: the same font-safe filter as VN, then tidy what a dropped
 * script leaves behind ("ILLIT (아일릿)" → "ILLIT", stray quotes, dangling pipes).
 */
export function imageSafeTitleEn(text: string): string {
  const t = imageSafeText(text)
    .replace(/[([{]\s*(?:feat\.?|ft\.?|with)?\s*[)\]}]/gi, " ")
    .replace(/(^|\s)['‘’"“”](?=\s)/g, "$1")
    .replace(/(^|\s)[|·•–-](?=\s*$)/g, "")
    .replace(/^\s*[|·•–-]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return t || "…";
}

/** Locale strings the image renderer needs. VN strings are unchanged from the original image. */
export function shareCopy(def: ShareBoardDef, at: number) {
  if (def.locale === "en") {
    return { dateLine: etDateLine(at), source: `Source: ${def.source}`, updated: `Updated ${etTime(at)} ET · hourly`, empty: "This board is updating. Check back in a few minutes." };
  }
  return { dateLine: vnDateLine(at), source: `Nguồn: ${def.source}`, updated: `Cập nhật ${vnTime(at)} (giờ VN) · mỗi giờ một lần`, empty: "Board đang cập nhật, quay lại sau ít phút nhé." };
}

/** Ready-to-paste English caption: title, numbered list, link, hashtags. */
export function shareCaptionEn(data: ShareData, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const { def, items, at } = data;
  const lines = [`🔥 ${def.title[0]} ${def.title[1]} (${etDateLine(at)})`, ""];
  if (!items.length) lines.push("This board is updating. Check back in a few minutes.");
  for (const item of items) {
    const metric = data.board ? def.metric(item, data.board) : null;
    lines.push(`${item.rank}. ${clipTitle(item.title, 90)}${metric ? ` (${metric})` : ""}`);
  }
  lines.push("", `Live Top 10, updated every hour: ${base}${def.path}`, `Source: ${def.source}. Updated ${etTime(at)} ET.`);
  lines.push("", ["#SurgeIndex", ...(def.hashtags ?? ["#Trending"])].join(" "));
  return lines.join("\n");
}
