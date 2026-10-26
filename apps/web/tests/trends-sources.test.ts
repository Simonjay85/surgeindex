import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildBoard } from "../lib/trends/ingest";
import { isAmazonRobotPage, isEbayBlockPage, isWikiArticle, mapWikiArticles, parseAmazonCarousels, parseEbayTrending, parseWikiTop, pickAmazonTop } from "../lib/trends/sources";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", "trends", name), "utf8");
const T0 = Date.parse("2026-10-26T13:00:00Z");

describe("wikipedia most-read", () => {
  it("drops main pages, namespaces and bot-driven adult titles", () => {
    expect(isWikiArticle("Main_Page")).toBe(false);
    expect(isWikiArticle("Special:Search")).toBe(false);
    expect(isWikiArticle("Wikipedia:Featured_pictures")).toBe(false);
    expect(isWikiArticle("Portal:Current_events")).toBe(false);
    expect(isWikiArticle("File:Example.jpg")).toBe(false);
    expect(isWikiArticle("Talk:Elon_Musk")).toBe(false);
    expect(isWikiArticle("-")).toBe(false);
    expect(isWikiArticle(".xxx")).toBe(false);
    expect(isWikiArticle("Trang_Chính")).toBe(false);
    expect(isWikiArticle("Đặc_biệt:Tìm_kiếm")).toBe(false);
    expect(isWikiArticle("Tập_tin:Youtube_logo.png")).toBe(false);
    expect(isWikiArticle("Elizabeth_Holmes")).toBe(true);
    expect(isWikiArticle("Clayface_(film)")).toBe(true);
    expect(isWikiArticle("BigBang_(nhóm_nhạc)")).toBe(true);
  });

  it("parses the English top list into ten linked articles", () => {
    const top = parseWikiTop(JSON.parse(fixture("wikipedia-top-en.json")));
    const items = mapWikiArticles("en", top, null);
    expect(items).toHaveLength(10);
    expect(items.map((i) => i.title)).not.toContain("Main Page");
    expect(items[0]!.url).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
    expect(items[0]!.metric).toBeGreaterThan(100_000);
    expect(items[0]!.velocityHint).toBeCloseTo(items[0]!.metric! / 24);
    for (let i = 1; i < items.length; i++) expect(items[i]!.metric!).toBeLessThanOrEqual(items[i - 1]!.metric!);
  });

  it("filters the Vietnamese list and lets the Action API veto non-articles", () => {
    const top = parseWikiTop(JSON.parse(fixture("wikipedia-top-vi.json")));
    expect(top.map((a) => a.article)).not.toContain("Trang_Chính");
    expect(top.some((a) => a.article.startsWith("Đặc_biệt:"))).toBe(false);
    const info = new Map([
      [top[0]!.article, { ns: 0, title: top[0]!.article.replace(/_/g, " "), description: "Nhóm nhạc Hàn Quốc", thumbnail: { source: "https://upload.wikimedia.org/x.jpg?utm_source=vi" } }],
      [top[1]!.article, { ns: 4, title: "Wikipedia:Something" }],
    ]);
    const items = mapWikiArticles("vi", top, info);
    expect(items[0]!.subtitle).toBe("Nhóm nhạc Hàn Quốc");
    expect(items[0]!.thumbnail).toBe("https://upload.wikimedia.org/x.jpg");
    expect(items.map((i) => i.id)).not.toContain(top[1]!.article.toLowerCase());
    expect(items[0]!.url.startsWith("https://vi.wikipedia.org/wiki/")).toBe(true);
  });
});

describe("amazon charts", () => {
  it("parses best-seller carousels into canonical /dp/ links with department leaders first", () => {
    const parsed = parseAmazonCarousels(fixture("amazon-bestsellers.html"));
    expect(parsed.length).toBe(9);
    const top = pickAmazonTop(parsed, "bestsellers");
    expect(top.slice(0, 3).every((i) => i.subtitle?.startsWith("#1 in "))).toBe(true);
    for (const i of top) {
      expect(i.url).toMatch(/^https:\/\/www\.amazon\.com\/dp\/[A-Z0-9]{10}$/);
      expect(i.title.length).toBeGreaterThan(3);
      expect(i.metric).toBeNull();
    }
    expect(top[0]!.thumbnail).toMatch(/^https:\/\//);
    expect(top[0]!.tags?.[0]).toMatch(/^\$/);
  });

  it("ranks movers by sales-rank gain across departments", () => {
    const top = pickAmazonTop(parseAmazonCarousels(fixture("amazon-movers.html")), "movers");
    expect(top.map((i) => i.id)).toEqual(["B0TOYS0001", "B0ELEC0001", "B0TOYS0002"]);
    expect(top[0]!.metric).toBe(12_450);
    expect(top[0]!.title).toBe("Glow Puzzle Cube & Stand, 3x3");
    expect(top[0]!.url).toBe("https://www.amazon.com/dp/B0TOYS0001");
    expect(top[0]!.subtitle).toBe("Movers & Shakers · #1 in Toys & Games");
    expect(top[1]!.tags).toContain("★ 4.5 (12,345)");
  });

  it("detects the robot check page", () => {
    expect(isAmazonRobotPage(fixture("amazon-robot.html"))).toBe(true);
    expect(isAmazonRobotPage(fixture("amazon-bestsellers.html"))).toBe(false);
  });
});

describe("ebay trending deals", () => {
  it("parses the trending carousel (not the spotlight) into ten listings", () => {
    const html = fixture("ebay-trending.html");
    expect(isEbayBlockPage(html)).toBe(false);
    const items = parseEbayTrending(html);
    expect(items).toHaveLength(10);
    expect(new Set(items.map((i) => i.id)).size).toBe(10);
    for (const i of items) {
      expect(i.url).toMatch(/^https:\/\/www\.ebay\.com\/itm\/\d+$/);
      expect(i.thumbnail ?? "https://i.ebayimg.com").toMatch(/^https:\/\/i\.ebayimg\.com\//);
    }
    expect(items.some((i) => i.metric !== null && i.metric > 0 && i.metric < 100)).toBe(true);
    expect(items[0]!.subtitle).toMatch(/^\$/);
  });

  it("flags a challenge page with no listings", () => {
    expect(isEbayBlockPage("<html><title>Pardon Our Interruption...</title></html>")).toBe(true);
  });
});

describe("boards without growth history", () => {
  it("scores a first eBay read from position alone and keeps heat ordered", () => {
    const items = parseEbayTrending(fixture("ebay-trending.html"));
    const board = buildBoard({ source: "ebay", region: "global" }, { items, via: "fixture" }, undefined, T0);
    expect(board.items.every((i) => i.movement === "none" && i.velocityMeasured === false)).toBe(true);
    expect(board.items[0]!.heat).toBeGreaterThan(board.items[9]!.heat);
    expect(board.items[0]!.heat).toBeGreaterThan(50);
  });

  it("never measures Wikipedia velocity from two reads of the same daily total", () => {
    const top = mapWikiArticles("en", parseWikiTop(JSON.parse(fixture("wikipedia-top-en.json"))), null);
    const first = buildBoard({ source: "wikipedia", region: "global" }, { items: top, via: "fixture" }, undefined, T0);
    const second = buildBoard({ source: "wikipedia", region: "global" }, { items: top, via: "fixture" }, first, T0 + 3_600_000);
    expect(second.items[0]!.velocityMeasured).toBe(false);
    expect(second.items[0]!.velocityPerHour).toBeGreaterThan(0);
    expect(second.items[0]!.movement).toBe("same");
    expect(second.items[0]!.why).toContain("reads in the last full day");
  });

  it("scores Amazon best sellers (no metric) without treating velocity as zero", () => {
    const top = pickAmazonTop(parseAmazonCarousels(fixture("amazon-bestsellers.html")), "bestsellers");
    const board = buildBoard({ source: "amazon", region: "global" }, { items: top, via: "fixture" }, undefined, T0);
    expect(board.items[0]!.heat).toBeGreaterThan(70);
  });
});
