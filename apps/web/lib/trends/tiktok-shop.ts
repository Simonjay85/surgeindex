/**
 * TikTok Shop Vietnam board, read from the official AccessTrade affiliate
 * product feed (campaign 6648523843406889655).
 *
 * `units_sold` in the feed is a lifetime (cumulative) counter, so a raw sort
 * would rank old products forever. Every hourly run stores one sample of
 * units_sold per product in the shared data dir; once ~20 hours of history
 * exist the board ranks by units sold in the last 24 hours ("Bán thêm 24h").
 * Until then it ranks by the cumulative counter and says so
 * ("Tổng đã bán (lũy kế)").
 *
 * Affiliate links are created once per product (POST product_link/create) and
 * cached in the shared data dir. When creation fails the row links to the
 * plain product page.
 *
 *   <dir>/tiktok-shop/units.json      { version, products: { id: [[ms, units], …] } }
 *   <dir>/tiktok-shop/aff-links.json  { version, links: { id: { url, createdAt } } }
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RawTrendItem } from "./types";

export const ACCESSTRADE_API = "https://api.accesstrade.vn";
export const TIKTOK_SHOP_CAMPAIGN_ID = "6648523843406889655";
export const TIKTOK_SHOP_DIR = "tiktok-shop";
export const TIKTOK_UNITS_FILE = "units.json";
export const TIKTOK_LINKS_FILE = "aff-links.json";
export const TIKTOK_ATTRIBUTION = "TikTok Shop qua AccessTrade";
export const LABEL_UNITS_24H = "Bán thêm 24h";
export const LABEL_UNITS_TOTAL = "Tổng đã bán (lũy kế)";

const BOARD_SIZE = 10;
const FEED_LIMIT = 50;
const TIMEOUT_MS = 15_000;
/** Hours of history a product needs before its 24h sales can be measured. */
export const MIN_HISTORY_HOURS = 20;
const WINDOW_HOURS = 24;
const SAMPLE_RETENTION_HOURS = 48;
/** A second run within this gap (deploy seed + cron) does not add a sample. */
const MIN_SAMPLE_GAP_MS = 30 * 60_000;
/** The 24h ranking needs at least this many measurable products, else cumulative. */
const MIN_MEASURABLE = 5;

export function accessTradeKey(): string | undefined {
  return process.env.ACCESSTRADE_API_KEY?.trim() || undefined;
}

export function accessTradeConfigured(): boolean {
  return Boolean(accessTradeKey());
}

/* ───────────────────────────── Feed ───────────────────────────── */

interface Money {
  currency?: string;
  minimum_amount?: string;
  maximum_amount?: string;
}

export interface TikTokFeedProduct {
  id: string;
  title: string;
  units_sold: number | string | null;
  detail_link: string;
  main_image_url?: string;
  has_inventory?: boolean;
  sales_price?: Money | null;
  original_price?: Money | null;
  shop?: { id?: string; name?: string } | null;
}

export interface TikTokProduct {
  id: string;
  title: string;
  unitsSold: number;
  detailLink: string;
  image?: string;
  shop?: string;
  price?: string;
}

function safeHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

const vnd = new Intl.NumberFormat("vi-VN");

export function formatVnd(n: number): string {
  return `${vnd.format(Math.round(n))}₫`;
}

export function priceText(price: Money | null | undefined): string | undefined {
  const min = Number(price?.minimum_amount);
  const max = Number(price?.maximum_amount);
  if (!Number.isFinite(min) || min <= 0) return undefined;
  if (!Number.isFinite(max) || max <= min) return formatVnd(min);
  return `${formatVnd(min)} – ${formatVnd(max)}`;
}

function clip(t: string, n = 140): string {
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Normalizes the raw feed: in-stock only, one row per product id, valid links only. */
export function parseTikTokFeed(json: unknown): TikTokProduct[] {
  const data = (json as { data?: { products?: TikTokFeedProduct[] } | TikTokFeedProduct[] })?.data;
  const list = Array.isArray(data) ? data : data?.products ?? [];
  const seen = new Set<string>();
  const out: TikTokProduct[] = [];
  for (const p of list) {
    if (!p || typeof p.id !== "string" || !p.id || seen.has(p.id)) continue;
    if (p.has_inventory === false) continue;
    const link = safeHttpsUrl(p.detail_link);
    const units = Number(p.units_sold);
    const title = typeof p.title === "string" ? p.title.normalize("NFC").replace(/\s+/g, " ").trim() : "";
    if (!link || !title || !Number.isFinite(units) || units < 0) continue;
    seen.add(p.id);
    out.push({
      id: p.id,
      title: clip(title),
      unitsSold: Math.round(units),
      detailLink: link,
      image: safeHttpsUrl(p.main_image_url),
      shop: p.shop?.name?.trim() || undefined,
      price: priceText(p.sales_price) ?? priceText(p.original_price),
    });
  }
  return out;
}

async function apiFetch(url: string, key: string, init: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Token ${key}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`AccessTrade request failed (${(e as Error).name})`);
  }
  // Never echo headers: they carry the API key.
  if (!res.ok) throw new Error(`AccessTrade responded ${res.status}`);
  return res.json();
}

export async function fetchTikTokFeed(key: string): Promise<TikTokProduct[]> {
  const json = await apiFetch(`${ACCESSTRADE_API}/v2/tiktokshop_product_feeds?sort_field=BEST_SELLERS&limit=${FEED_LIMIT}`, key);
  return parseTikTokFeed(json);
}

/* ───────────────────────────── Units history ───────────────────────────── */

export type UnitSample = [number, number];

export interface UnitsStore {
  version: 1;
  products: Record<string, UnitSample[]>;
}

export function emptyUnitsStore(): UnitsStore {
  return { version: 1, products: {} };
}

/** Adds this run's units_sold per product and prunes samples older than 48h. Pure. */
export function recordSamples(store: UnitsStore, products: TikTokProduct[], now: number): UnitsStore {
  const out: UnitsStore = { version: 1, products: {} };
  const cutoff = now - SAMPLE_RETENTION_HOURS * 3_600_000;
  for (const [id, samples] of Object.entries(store.products ?? {})) {
    const kept = (Array.isArray(samples) ? samples : []).filter((s) => Array.isArray(s) && Number.isFinite(s[0]) && Number.isFinite(s[1]) && s[0] >= cutoff && s[0] <= now);
    if (kept.length) out.products[id] = kept.sort((a, b) => a[0] - b[0]);
  }
  for (const p of products) {
    const list = out.products[p.id] ?? [];
    const last = list[list.length - 1];
    if (last && now - last[0] < MIN_SAMPLE_GAP_MS) list[list.length - 1] = [last[0], p.unitsSold];
    else list.push([now, p.unitsSold]);
    out.products[p.id] = list;
  }
  return out;
}

/**
 * Units sold over roughly the last 24 hours, or null when the product has
 * fewer than MIN_HISTORY_HOURS of samples. The baseline is the newest sample
 * at or before now-24h, else the oldest sample (≥ 20h old).
 */
export function unitsSoldLast24h(samples: UnitSample[] | undefined, current: number, now: number): number | null {
  if (!samples?.length) return null;
  const sorted = [...samples].sort((a, b) => a[0] - b[0]);
  const oldest = sorted[0]!;
  if (now - oldest[0] < MIN_HISTORY_HOURS * 3_600_000) return null;
  const windowStart = now - WINDOW_HOURS * 3_600_000;
  let base = oldest;
  for (const s of sorted) if (s[0] <= windowStart) base = s;
  return Math.max(0, current - base[1]);
}

export type RankBasis = "units-24h" | "units-cumulative";

export interface RankedProduct {
  product: TikTokProduct;
  sold24h: number | null;
}

export function rankTikTokProducts(products: TikTokProduct[], store: UnitsStore, now: number): { basis: RankBasis; ranked: RankedProduct[] } {
  const withDelta = products.map((p) => ({ product: p, sold24h: unitsSoldLast24h(store.products[p.id], p.unitsSold, now) }));
  const measurable = withDelta.filter((r) => r.sold24h !== null);
  if (measurable.length >= MIN_MEASURABLE) {
    const ranked = measurable.sort((a, b) => b.sold24h! - a.sold24h! || b.product.unitsSold - a.product.unitsSold).slice(0, BOARD_SIZE);
    return { basis: "units-24h", ranked };
  }
  return { basis: "units-cumulative", ranked: withDelta.sort((a, b) => b.product.unitsSold - a.product.unitsSold).slice(0, BOARD_SIZE) };
}

/* ───────────────────────────── Affiliate links ───────────────────────────── */

export interface LinkCache {
  version: 1;
  links: Record<string, { url: string; createdAt: string }>;
}

export function emptyLinkCache(): LinkCache {
  return { version: 1, links: {} };
}

/** Matches product_link/create success rows back to product ids by their origin URL. */
export function parseCreatedLinks(json: unknown, byUrl: Map<string, string>): Record<string, string> {
  const rows = (json as { data?: { success_link?: Array<{ aff_link?: string; short_link?: string; url_origin?: string }> } })?.data?.success_link ?? [];
  const out: Record<string, string> = {};
  for (const row of rows) {
    const id = row.url_origin ? byUrl.get(row.url_origin) : undefined;
    const link = safeHttpsUrl(row.aff_link) ?? safeHttpsUrl(row.short_link);
    if (id && link) out[id] = link;
  }
  return out;
}

/** Creates affiliate links for products not yet in the cache (one batched POST). Failures leave them uncached. */
export async function ensureAffiliateLinks(products: TikTokProduct[], cache: LinkCache, key: string, now: number, log: (line: string) => void = console.log): Promise<LinkCache> {
  const missing = products.filter((p) => !cache.links[p.id]);
  if (!missing.length) return cache;
  const byUrl = new Map(missing.map((p) => [p.detailLink, p.id]));
  try {
    const json = await apiFetch(`${ACCESSTRADE_API}/v1/product_link/create`, key, {
      method: "POST",
      body: JSON.stringify({ campaign_id: TIKTOK_SHOP_CAMPAIGN_ID, urls: missing.map((p) => p.detailLink), utm_source: "surgeindex" }),
    });
    const created = parseCreatedLinks(json, byUrl);
    const next: LinkCache = { version: 1, links: { ...cache.links } };
    const at = new Date(now).toISOString();
    for (const [id, url] of Object.entries(created)) next.links[id] = { url, createdAt: at };
    const failed = missing.length - Object.keys(created).length;
    log(`[trends] tiktok-shop affiliate links: ${Object.keys(created).length} created${failed ? `, ${failed} failed (plain product link used, retried next run)` : ""}`);
    return next;
  } catch (e) {
    log(`[trends] tiktok-shop affiliate links: creation failed (${(e as Error).message}); plain product links used, retried next run`);
    return cache;
  }
}

/* ───────────────────────────── Board items ───────────────────────────── */

/** One-line "why" for a TikTok Shop row (24h mode when velocityHint is set). */
export function tiktokWhy(metric: number | null, velocityHint: number | null | undefined): string {
  const n = vnd.format(metric ?? 0);
  if (velocityHint !== null && velocityHint !== undefined) return `Bán thêm ${n} sản phẩm trong 24 giờ qua`;
  return `Tổng ${n} đã bán (lũy kế) · chưa đủ dữ liệu để đo bán thêm 24h`;
}

export function toRawItems(ranked: RankedProduct[], basis: RankBasis, links: LinkCache): RawTrendItem[] {
  return ranked.map((r) => {
    const p = r.product;
    const metric = basis === "units-24h" ? r.sold24h ?? 0 : p.unitsSold;
    const tags = [p.price, basis === "units-24h" ? `Tổng đã bán ${vnd.format(p.unitsSold)}` : undefined].filter((t): t is string => Boolean(t));
    return {
      id: p.id,
      title: p.title,
      url: links.links[p.id]?.url ?? p.detailLink,
      subtitle: p.shop,
      thumbnail: p.image,
      metric,
      velocityHint: basis === "units-24h" ? metric / WINDOW_HOURS : null,
      comments: null,
      tags: tags.length ? tags : undefined,
    } satisfies RawTrendItem;
  });
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

export interface TikTokFetchResult {
  items: RawTrendItem[];
  via: string;
  basis: RankBasis;
}

export interface TikTokDeps {
  fetchFeed?: (key: string) => Promise<TikTokProduct[]>;
  createLinks?: typeof ensureAffiliateLinks;
  log?: (line: string) => void;
}

export async function fetchTikTokShop(dir: string, now: number, deps: TikTokDeps = {}): Promise<TikTokFetchResult> {
  const key = accessTradeKey();
  if (!key) throw new Error("ACCESSTRADE_API_KEY is not configured");
  const log = deps.log ?? console.log;
  const products = await (deps.fetchFeed ?? fetchTikTokFeed)(key);
  if (products.length < 3) throw new Error(`AccessTrade TikTok Shop feed returned only ${products.length} products`);

  const unitsFile = path.join(dir, TIKTOK_SHOP_DIR, TIKTOK_UNITS_FILE);
  const linksFile = path.join(dir, TIKTOK_SHOP_DIR, TIKTOK_LINKS_FILE);
  const store = recordSamples((await readJson<UnitsStore>(unitsFile)) ?? emptyUnitsStore(), products, now);
  await writeJsonAtomic(unitsFile, store);

  const { basis, ranked } = rankTikTokProducts(products, store, now);
  const cache = (await readJson<LinkCache>(linksFile)) ?? emptyLinkCache();
  const links = await (deps.createLinks ?? ensureAffiliateLinks)(ranked.map((r) => r.product), cache, key, now, log);
  if (links !== cache) await writeJsonAtomic(linksFile, links);

  return {
    items: toRawItems(ranked, basis, links),
    via: `accesstrade tiktokshop_product_feeds BEST_SELLERS (${products.length} products, ranked by ${basis === "units-24h" ? "units sold in 24h" : "cumulative units sold"})`,
    basis,
  };
}
