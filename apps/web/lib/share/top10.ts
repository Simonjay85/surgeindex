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

export interface ShareBoardDef {
  id: string;
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
