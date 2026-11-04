import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBoard, fetchTikTokShopVn, unfetchableBoard } from "../lib/trends/ingest";
import {
  emptyLinkCache,
  emptyUnitsStore,
  parseCreatedLinks,
  parseTikTokFeed,
  priceText,
  rankTikTokProducts,
  recordSamples,
  toRawItems,
  unitsSoldLast24h,
  type TikTokProduct,
} from "../lib/trends/tiktok-shop";
import { boardId, externalRel, getSourceMeta, getSourceMetaByBoardId, type TrendBoard } from "../lib/trends/types";

const H = 3_600_000;
const T0 = Date.parse("2026-10-27T10:00:00+07:00");

const feedRow = (id: string, units: number | string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Sản phẩm ${id}`,
  units_sold: units,
  detail_link: `https://shop.tiktok.com/view/product/${id}?region=VN&local=en`,
  main_image_url: `https://p16-oec-sg.ibyteimg.com/${id}.jpeg`,
  has_inventory: true,
  sales_price: { currency: "VND", minimum_amount: "99000", maximum_amount: "298500" },
  shop: { id: "", name: `Shop ${id}` },
  ...extra,
});

const product = (id: string, units: number): TikTokProduct => ({ id, title: id, unitsSold: units, detailLink: `https://shop.tiktok.com/view/product/${id}` });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("TikTok Shop feed (AccessTrade)", () => {
  it("parses the feed: in-stock only, deduped, https links, NFC titles, VND prices", () => {
    const items = parseTikTokFeed({
      code: "0",
      data: {
        products: [
          feedRow("1", 741),
          feedRow("1", 999),
          feedRow("2", 50, { has_inventory: false }),
          feedRow("3", 10, { detail_link: "javascript:alert(1)" }),
          feedRow("4", "438585", { title: "Vie\u0302n ke\u0303m", sales_price: { minimum_amount: "149000", maximum_amount: "149000" } }),
        ],
      },
    });
    expect(items.map((i) => i.id)).toEqual(["1", "4"]);
    expect(items[0]).toMatchObject({ unitsSold: 741, shop: "Shop 1", price: "99.000₫ – 298.500₫" });
    expect(items[1]!.title).toBe("Viên kẽm");
    expect(items[1]!.unitsSold).toBe(438585);
    expect(items[1]!.price).toBe("149.000₫");
    expect(priceText(null)).toBeUndefined();
  });

  it("measures 24h sales only once ~20h of samples exist", () => {
    expect(unitsSoldLast24h([[T0, 100]], 150, T0 + 10 * H)).toBeNull();
    expect(unitsSoldLast24h([[T0, 100]], 150, T0 + 21 * H)).toBe(50);
    // baseline is the newest sample at or before now-24h
    expect(unitsSoldLast24h([[T0, 100], [T0 + 2 * H, 130], [T0 + 10 * H, 170]], 200, T0 + 26 * H)).toBe(70);
    // a counter that went down never yields negative sales
    expect(unitsSoldLast24h([[T0, 100]], 90, T0 + 25 * H)).toBe(0);
  });

  it("records hourly samples, merges runs closer than 30 min and prunes after 48h", () => {
    let store = recordSamples(emptyUnitsStore(), [product("a", 1)], T0);
    store = recordSamples(store, [product("a", 2)], T0 + 10 * 60_000);
    expect(store.products.a).toEqual([[T0, 2]]);
    store = recordSamples(store, [product("a", 3)], T0 + H);
    expect(store.products.a).toHaveLength(2);
    store = recordSamples(store, [product("b", 5)], T0 + 50 * H);
    expect(store.products.a).toBeUndefined();
    expect(store.products.b).toEqual([[T0 + 50 * H, 5]]);
  });

  it("ranks by cumulative units until enough history, then by units sold in 24h", () => {
    const day0 = Array.from({ length: 8 }, (_, i) => product(`p${i}`, 1000 * (i + 1)));
    let store = recordSamples(emptyUnitsStore(), day0, T0);
    const first = rankTikTokProducts(day0, store, T0);
    expect(first.basis).toBe("units-cumulative");
    expect(first.ranked[0]!.product.id).toBe("p7");

    // 24h later p0 (smallest lifetime total) sold the most.
    const day1 = day0.map((p, i) => ({ ...p, unitsSold: p.unitsSold + (i === 0 ? 900 : 10 * i) }));
    store = recordSamples(store, day1, T0 + 24 * H);
    const second = rankTikTokProducts(day1, store, T0 + 24 * H);
    expect(second.basis).toBe("units-24h");
    expect(second.ranked[0]!.product.id).toBe("p0");
    expect(second.ranked[0]!.sold24h).toBe(900);

    const items = toRawItems(second.ranked, second.basis, { version: 1, links: { p0: { url: "https://go.isclix.com/deep_link/x", createdAt: "x" } } });
    expect(items[0]).toMatchObject({ id: "p0", metric: 900, url: "https://go.isclix.com/deep_link/x" });
    expect(items[1]!.url).toBe("https://shop.tiktok.com/view/product/p7");
    expect(items[0]!.tags).toContain("Tổng đã bán 1.900");
  });

  it("matches created affiliate links back to products by origin URL", () => {
    const byUrl = new Map([["https://shop.tiktok.com/view/product/1", "1"], ["https://shop.tiktok.com/view/product/2", "2"]]);
    const links = parseCreatedLinks(
      { data: { success_link: [{ aff_link: "https://go.isclix.com/deep_link/a", url_origin: "https://shop.tiktok.com/view/product/1" }, { aff_link: "http://insecure", url_origin: "https://shop.tiktok.com/view/product/2" }], error_link: [] } },
      byUrl,
    );
    expect(links).toEqual({ "1": "https://go.isclix.com/deep_link/a" });
  });
});

describe("TikTok Shop board", () => {
  it("is a Vietnam affiliate board reachable by its board id", () => {
    const meta = getSourceMeta("tiktok-shop")!;
    expect(meta.regions).toEqual(["vn"]);
    expect(boardId("tiktok-shop", "vn")).toBe("tiktok-shop-vn");
    expect(getSourceMetaByBoardId("tiktok-shop-vn")?.key).toBe("tiktok-shop");
    expect(getSourceMetaByBoardId("google-trends-vn")).toBeUndefined();
    expect(externalRel(meta)).toContain("sponsored");
    expect(externalRel(getSourceMeta("reddit"))).not.toContain("sponsored");
    expect(getSourceMeta("shopee")?.comingSoon).toBe(true);
  });

  it("shows Coming soon without a key, and keeps the last good items as Delayed if it was live", () => {
    const spec = { source: "tiktok-shop" as const, region: "vn" as const, soonNote: "x", missingKey: "ACCESSTRADE_API_KEY" };
    expect(unfetchableBoard(spec, undefined).board.status).toBe("soon");
    const live = buildBoard(spec, { items: toRawItems([{ product: product("a", 5), sold24h: null }], "units-cumulative", emptyLinkCache()), via: "t", metricLabel: "Tổng đã bán (lũy kế)", attribution: "Nguồn: TikTok Shop qua AccessTrade." }, undefined, T0);
    expect(live.metricLabel).toBe("Tổng đã bán (lũy kế)");
    expect(live.attribution).toContain("AccessTrade");
    const stale = unfetchableBoard(spec, live as TrendBoard).board;
    expect(stale.status).toBe("stale");
    expect(stale.items).toHaveLength(1);
  });

  it("fetches the feed, stores history and caches affiliate links in the data dir", async () => {
    vi.stubEnv("ACCESSTRADE_API_KEY", "test-key");
    const calls: Array<{ url: string; auth: string | null; body?: string }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const auth = new Headers(init.headers).get("Authorization");
      calls.push({ url, auth, body: init.body as string | undefined });
      if (url.includes("tiktokshop_product_feeds")) return new Response(JSON.stringify({ data: { products: Array.from({ length: 12 }, (_, i) => feedRow(String(i + 1), 100 * (i + 1))) } }));
      const urls = JSON.parse(init.body as string).urls as string[];
      return new Response(JSON.stringify({ data: { success_link: urls.slice(1).map((u) => ({ aff_link: `https://go.isclix.com/deep_link/${encodeURIComponent(u)}`, url_origin: u })) } }));
    });
    const dir = mkdtempSync(path.join(tmpdir(), "tts-"));
    const res = await fetchTikTokShopVn(dir, T0);
    expect(res.items).toHaveLength(10);
    expect(res.metricLabel).toBe("Tổng đã bán (lũy kế)");
    expect(res.items[0]!.metric).toBe(1200);
    expect(res.items[0]!.url).toContain("shop.tiktok.com"); // first link creation "failed": plain product link
    expect(res.items[1]!.url).toContain("go.isclix.com");
    expect(calls.every((c) => c.auth === "Token test-key")).toBe(true);
    const cache = JSON.parse(readFileSync(path.join(dir, "tiktok-shop", "aff-links.json"), "utf8"));
    expect(Object.keys(cache.links)).toHaveLength(9);
    const units = JSON.parse(readFileSync(path.join(dir, "tiktok-shop", "units.json"), "utf8"));
    expect(Object.keys(units.products)).toHaveLength(12);

    // Next hour: only the product whose link failed is retried.
    calls.length = 0;
    await fetchTikTokShopVn(dir, T0 + H);
    const post = calls.find((c) => c.url.includes("product_link/create"));
    expect(JSON.parse(post!.body!).urls).toHaveLength(1);
  });
});
