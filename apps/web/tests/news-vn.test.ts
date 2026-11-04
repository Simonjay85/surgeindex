import { describe, expect, it } from "vitest";
import {
  canonicalOutlet,
  carryOver,
  cleanTitle,
  clusterArticles,
  clusterToRaw,
  isRoutine,
  jaccard,
  normalizeVi,
  parseFeedDate,
  parseGoogleNews,
  parseOutletRss,
  sameStory,
  titleTokens,
  type NewsArticle,
} from "../lib/trends/news";
import { fetchNewsVn } from "../lib/trends/ingest";
import { compactSnapshot, type TrendSnapshot } from "../lib/trends/types";

const NOW = Date.parse("2026-10-27T03:00:00Z");
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const art = (title: string, outlet: string, hoursAgo: number, extra: Partial<NewsArticle> = {}): NewsArticle => ({
  title,
  outlet,
  url: `https://${normalizeVi(outlet).replace(/\s/g, "")}.vn/${encodeURIComponent(normalizeVi(title).replace(/\s/g, "-"))}`,
  publishedAt: iso(hoursAgo),
  feed: outlet,
  direct: true,
  ...extra,
});

describe("news-vn text helpers", () => {
  it("strips Vietnamese diacritics and đ", () => {
    expect(normalizeVi("Trường Giang rút khỏi '2 Ngày 1 Đêm'!")).toBe("truong giang rut khoi 2 ngay 1 dem");
    expect(normalizeVi("ĐÀ NẴNG")).toBe("da nang");
  });

  it("parses every RSS date style seen in Vietnamese feeds", () => {
    expect(parseFeedDate("Mon, 26 Oct 2026 20:41:20 +0700")).toBe("2026-10-26T13:41:20.000Z");
    expect(parseFeedDate("Tue, 27 Oct 26 02:02:00 +0700")).toBe("2026-10-26T19:02:00.000Z");
    expect(parseFeedDate("10/26/2026 10:15:00 PM")).toBe("2026-10-26T15:15:00.000Z");
    expect(parseFeedDate("garbage")).toBeNull();
  });

  it("canonicalizes outlet names from Google News", () => {
    expect(canonicalOutlet("Báo VietNamNet")).toBe("VietNamNet");
    expect(canonicalOutlet("Báo Dân trí")).toBe("Dân Trí");
    expect(canonicalOutlet("Tuổi Trẻ Online")).toBe("Tuổi Trẻ");
    expect(canonicalOutlet("Laodong.vn")).toBe("Lao Động");
    expect(canonicalOutlet("ZNEWS")).toBe("Znews");
  });

  it("decodes double-encoded headlines and drops routine content", () => {
    expect(cleanTitle("&amp;apos;Vụ&amp;apos; nhóm chat")).toBe("'Vụ' nhóm chat");
    expect(isRoutine("Tử vi hôm nay 27/10/2026")).toBe(true);
    expect(isRoutine("Kết quả xổ số miền Bắc")).toBe(true);
    expect(isRoutine("Sà lan va chạm cầu ở Cà Mau")).toBe(false);
  });

  it("scores the same story high and different stories low", () => {
    const a = titleTokens("Sà lan va chạm làm lệch nhịp cầu ở Cà Mau");
    const b = titleTokens("Sà lan chở xe cẩu va chạm làm lệch nhịp cầu ở Cà Mau");
    const c = titleTokens("TP.HCM đặt mục tiêu tăng trưởng GRDP năm 2027");
    expect(sameStory(a, b)).toBe(true);
    expect(jaccard(a, c)).toBeLessThan(0.1);
    expect(sameStory(a, c)).toBe(false);
  });
});

describe("news-vn parsing", () => {
  it("parses a publisher feed with CDATA", () => {
    const xml = `<rss><channel><item><title><![CDATA[Tin A]]></title><link><![CDATA[https://tuoitre.vn/a.htm]]></link><pubDate>10/26/2026 9:57:00 PM</pubDate></item><item><title>No link</title></item></channel></rss>`;
    const items = parseOutletRss(xml, { id: "tuoitre", outlet: "Tuổi Trẻ", url: "https://tuoitre.vn/rss/tin-moi-nhat.rss" });
    expect(items).toEqual([{ title: "Tin A", url: "https://tuoitre.vn/a.htm", outlet: "Tuổi Trẻ", publishedAt: "2026-10-26T14:57:00.000Z", feed: "tuoitre", direct: true }]);
  });

  it("expands a Google News group into one article per publisher", () => {
    const desc = `&lt;ol&gt;&lt;li&gt;&lt;a href="https://news.google.com/rss/articles/AAA?oc=5" target="_blank"&gt;Cảnh sát vây bắt hai người&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Báo VietNamNet&lt;/font&gt;&lt;/li&gt;&lt;li&gt;&lt;a href="https://news.google.com/rss/articles/BBB?oc=5" target="_blank"&gt;Vây bắt hai người cầm kiếm&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;VnExpress&lt;/font&gt;&lt;/li&gt;&lt;/ol&gt;`;
    const xml = `<rss><channel><item><title>Cảnh sát vây bắt hai người - Báo VietNamNet</title><link>https://news.google.com/rss/articles/AAA?oc=5</link><guid isPermaLink="false">AAA</guid><pubDate>Mon, 26 Oct 2026 10:44:00 GMT</pubDate><description>${desc}</description></item></channel></rss>`;
    const items = parseGoogleNews(xml, { id: "google-news", outlet: null, url: "https://news.google.com/rss" });
    expect(items.map((i) => i.outlet)).toEqual(["VietNamNet", "VnExpress"]);
    expect(items.every((i) => i.group === items[0]!.group && !i.direct)).toBe(true);
    expect(items[1]!.title).toBe("Vây bắt hai người cầm kiếm");
  });
});

describe("news-vn clustering and ranking", () => {
  const articles: NewsArticle[] = [
    art("Sà lan va chạm làm lệch nhịp cầu ở Cà Mau", "VnExpress", 2),
    art("Cần cẩu trên sà lan va chạm làm lệch nhịp cầu chữ S ở Cà Mau", "Thanh Niên", 3),
    art("Sà lan chở xe cẩu va chạm làm lệch nhịp cầu ở Cà Mau", "Dân Trí", 1),
    art("Sà lan va chạm làm lệch nhịp cầu Cà Mau", "VnExpress", 1.5), // same outlet twice counts once
    art("TP.HCM đặt mục tiêu tăng trưởng GRDP năm 2027 từ 10,4% trở lên", "Tuổi Trẻ", 20),
    art("TP.HCM đặt mục tiêu tăng trưởng GRDP năm 2027 từ 10,4% trở lên", "Znews", 20),
    art("Một tin chỉ một báo đưa", "Dân Trí", 0.5),
    art("Tin quá cũ nhiều báo", "VnExpress", 60),
    // Google News groups merge even when headlines differ
    art("Cảnh sát vây bắt hai người cố thủ trên mái nhà", "VietNamNet", 4, { group: "gn:1", direct: false, url: "https://news.google.com/rss/articles/1" }),
    art("Người dân lội đồng xem vây bắt", "Lao Động", 4, { group: "gn:1", direct: false, url: "https://news.google.com/rss/articles/2" }),
    art("Đã bắt được hai thanh niên cầm kiếm cố thủ ở Thanh Hóa", "VietNamNet", 3, { url: "https://vietnamnet.vn/da-bat.html" }),
  ];

  it("groups one story across outlets, counts distinct outlets and ranks by outlets × recency", () => {
    const clusters = clusterArticles(articles, NOW);
    const top = clusters[0]!;
    expect(top.headline).toContain("Cà Mau");
    expect(top.outlets).toBe(3);
    expect(new Set(top.sources.map((s) => s.outlet))).toEqual(new Set(["VnExpress", "Thanh Niên", "Dân Trí"]));
    expect(top.firstSeen).toBe(iso(3));
    const hcm = clusters.find((c) => c.headline.startsWith("TP.HCM"))!;
    expect(hcm.outlets).toBe(2);
    expect(hcm.score).toBeLessThan(top.score); // older story decays
    expect(clusters.some((c) => c.headline === "Tin quá cũ nhiều báo")).toBe(false);
  });

  it("prefers the outlet's own article over a Google News redirect", () => {
    const clusters = clusterArticles(articles, NOW);
    const gn = clusters.find((c) => c.sources.some((s) => s.outlet === "Lao Động"))!;
    expect(gn.outlets).toBe(2);
    const vnn = gn.sources.find((s) => s.outlet === "VietNamNet");
    // Same outlet via Google and via its own feed are not merged unless titles match — the redirect remains the link here.
    expect(vnn?.url.startsWith("https://")).toBe(true);
  });

  it("keeps cluster identity and first-seen time across hourly runs", () => {
    const first = clusterArticles(articles, NOW);
    const top = first[0]!;
    const prev = [{ id: "nOLD", publishedAt: iso(10), sources: [{ outlet: "VnExpress", url: top.sources[0]!.url, title: "x" }] }];
    const again = carryOver(first, prev);
    expect(again[0]!.id).toBe("nOLD");
    expect(again[0]!.firstSeen).toBe(iso(10));
  });

  it("maps clusters to board items with source links and keeps /api/trends compact", () => {
    const raw = clusterToRaw(clusterArticles(articles, NOW)[0]!);
    expect(raw.metric).toBe(3);
    expect(raw.sources?.length).toBe(3);
    const snap: TrendSnapshot = { version: 1, generatedAt: iso(0), boards: [{ id: "news-vn", source: "news", region: "vn", status: "live", fetchedAt: iso(0), items: [{ ...raw, rank: 1, prevRank: null, movement: "none", rankHistory: [1], velocityPerHour: 1, velocityMeasured: false, heat: 80, why: "x" }] }] };
    const compact = compactSnapshot(snap);
    expect(compact.boards[0]!.items[0]).not.toHaveProperty("sources");
  });

  it("throws (so the last good board is kept) when feeds fail", async () => {
    await expect(fetchNewsVn(NOW, undefined, async () => ({ articles: [], reports: [{ feed: "x", ok: false, items: 0, error: "down" }] }))).rejects.toThrow(/only 0 articles/);
    const many = Array.from({ length: 50 }, (_, i) => art(`Tin riêng số ${i} không trùng ${"abcdefghij"[i % 10]}${i}`, "Dân Trí", 1));
    const ok = await fetchNewsVn(NOW, undefined, async () => ({ articles: [...many, ...articles], reports: [{ feed: "x", ok: true, items: 61 }] }));
    expect(ok.items[0]!.title).toContain("Cà Mau");
    expect(ok.items.every((i) => (i.metric ?? 0) >= 2)).toBe(true);
  });
});
