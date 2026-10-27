import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { shareFontsDir } from "../lib/share/image";
import { clipTitle, etDateLine, etIsoDate, etTime, formatEnCompact, formatViCompact, getShareBoard, getShareBoardEn, imageSafeText, imageSafeTitleEn, SHARE_BOARDS, SHARE_BOARDS_EN, shareCaption, shareCaptionEn, shareCopy, shareData, shareImagePath, shareImagePathEn, vnDateLine, vnTime } from "../lib/share/top10";
import type { TrendBoard, TrendSnapshot } from "../lib/trends/types";

const item = (rank: number, title: string, metric: number | null) => ({ id: `i${rank}`, rank, title, url: `https://example.com/${rank}`, metric, prevRank: null, movement: "none" as const, rankHistory: [rank], velocityPerHour: null, velocityMeasured: false, heat: 50, why: "x" });

const board = (id: string, extra: Partial<TrendBoard> = {}): TrendBoard => ({
  id,
  source: id.startsWith("tiktok") ? "tiktok-shop" : "google-trends",
  region: "vn",
  status: "live",
  fetchedAt: "2026-10-27T09:05:00.000Z",
  items: Array.from({ length: 12 }, (_, i) => item(i + 1, `tìm kiếm số ${i + 1}`, 2000 - i * 100)),
  ...extra,
});

const snapshot: TrendSnapshot = { version: 1, generatedAt: "2026-10-27T09:10:00.000Z", boards: [board("google-trends-vn"), board("tiktok-shop-vn", { metricLabel: "Bán thêm 24h" })] };

describe("Top 10 share image helpers", () => {
  it("knows the shareable VN boards and their image paths", () => {
    expect(SHARE_BOARDS.map((b) => b.id)).toEqual(["google-trends-vn", "youtube-vn", "news-vn", "tiktok-shop-vn"]);
    expect(getShareBoard(null)?.id).toBe("google-trends-vn");
    expect(getShareBoard("reddit")).toBeUndefined();
    expect(shareImagePath(getShareBoard("google-trends-vn")!)).toBe("/api/share/top10-vn.png");
    expect(shareImagePath(getShareBoard("news-vn")!)).toBe("/api/share/top10-vn.png?board=news-vn");
  });

  it("formats Vietnam dates and short numbers", () => {
    const at = Date.parse("2026-10-27T18:30:00Z"); // 01:30 on Wednesday in Vietnam
    expect(vnDateLine(at)).toBe("Thứ Tư, 28/10/2026");
    expect(vnTime(at)).toBe("01:30");
    expect(formatViCompact(2000)).toBe("2.000");
    expect(formatViCompact(438_610)).toBe("439K");
    expect(formatViCompact(1_250_000)).toBe("1,3 triệu");
    expect(formatViCompact(2_000_000)).toBe("2 triệu");
  });

  it("clips long titles on a word boundary and drops glyphs the bundled font lacks", () => {
    const long = "【CRUSH BRAND DAY】JMCY DAV Chứng Nhận Bút Kẻ Mắt Dạng Gel Màu , Không Thấm Nước & Chống Nhòe Lâu Trôi Cả Ngày";
    const clipped = clipTitle(long, 64);
    expect(clipped.length).toBeLessThanOrEqual(64);
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped.startsWith("[CRUSH BRAND DAY] JMCY")).toBe(true);
    expect(clipTitle("Màu , Không")).toBe("Màu, Không");
    expect(clipTitle("ngắn")).toBe("ngắn");
    expect(imageSafeText("kia 대 삼성 🔥 đấu")).toBe("kia đấu");
    expect(imageSafeText("大谷")).toBe("…");
    expect(imageSafeText("Giá 99.000₫ – 298.500₫")).toBe("Giá 99.000₫ – 298.500₫");
  });

  it("takes the board's top 10 and builds a ready Vietnamese caption", () => {
    const data = shareData(snapshot, getShareBoard("google-trends-vn")!);
    expect(data.items).toHaveLength(10);
    const caption = shareCaption(data, "https://surgeindex.lol/");
    expect(caption).toContain("Top 10 người Việt đang tìm hôm nay (Thứ Ba, 27/10/2026)");
    expect(caption).toContain("1. tìm kiếm số 1 (2.000+ lượt tìm)");
    expect(caption).toContain("10. tìm kiếm số 10");
    expect(caption).not.toContain("11. ");
    expect(caption).toContain("https://surgeindex.lol/top-10/google-trends");
    expect(caption).toContain("16:05 (giờ VN)");

    const tts = shareCaption(shareData(snapshot, getShareBoard("tiktok-shop-vn")!), "https://surgeindex.lol");
    expect(tts).toContain("(+2.000 / 24h)");
    expect(tts).toContain("affiliate");

    const empty = shareCaption(shareData(snapshot, getShareBoard("youtube-vn")!), "https://surgeindex.lol");
    expect(empty).toContain("Board đang cập nhật");
  });

  it("ships self-hosted Vietnamese fonts", () => {
    const dir = shareFontsDir();
    for (const f of ["BeVietnamPro-Regular.ttf", "BeVietnamPro-SemiBold.ttf", "BeVietnamPro-ExtraBold.ttf"]) expect(existsSync(path.join(dir, f))).toBe(true);
  });
});

describe("English (global) share images", () => {
  const en = (id: string, extra: Partial<TrendBoard> = {}): TrendBoard => ({ ...board(id), region: "global", source: id as TrendBoard["source"], ...extra });
  const snap: TrendSnapshot = {
    version: 1,
    generatedAt: "2026-10-27T12:13:00Z",
    boards: [
      en("google-trends", { fetchedAt: "2026-10-27T12:13:00Z", items: Array.from({ length: 12 }, (_, i) => item(i + 1, `search ${i + 1}`, 20000 - i * 1000)) }),
      en("ebay", { items: [{ ...item(1, "Apple iPhone 13 128GB", 22), subtitle: "$217.79 · was $278.15" }] }),
      en("amazon", { items: [{ ...item(1, "Mighty Patch", null), subtitle: "#2 in Beauty & Personal Care" }] }),
    ],
  };

  it("serves only the global boards, google-trends by default", () => {
    expect(SHARE_BOARDS_EN.map((b) => b.id)).toEqual(["google-trends", "youtube", "reddit", "hackernews", "github", "wikipedia", "amazon", "ebay"]);
    expect(getShareBoardEn(null)?.id).toBe("google-trends");
    expect(getShareBoardEn("google-trends-vn")).toBeUndefined();
    expect(getShareBoardEn("nope")).toBeUndefined();
    expect(shareImagePathEn(getShareBoardEn("google-trends")!)).toBe("/api/share/top10.png");
    expect(shareImagePathEn(getShareBoardEn("reddit")!)).toBe("/api/share/top10.png?board=reddit");
    expect(getShareBoard("reddit")).toBeUndefined();
  });

  it("formats US Eastern dates (DST-aware) and short numbers", () => {
    const at = Date.parse("2026-10-27T12:13:00Z");
    expect(etDateLine(at)).toBe("Tuesday, October 27, 2026");
    expect(etTime(at)).toBe("08:13");
    expect(etIsoDate(at)).toBe("2026-10-27");
    const winter = Date.parse("2026-12-01T03:30:00Z"); // EST, previous day in New York
    expect(etDateLine(winter)).toBe("Monday, November 30, 2026");
    expect(etTime(winter)).toBe("22:30");
    expect(formatEnCompact(2859)).toBe("2,859");
    expect(formatEnCompact(511_715)).toBe("512K");
    expect(formatEnCompact(2_202_623)).toBe("2.2M");
    expect(formatEnCompact(15_000_000)).toBe("15M");
  });

  it("uses English copy on the image, VN copy unchanged", () => {
    const at = Date.parse("2026-10-27T12:13:00Z");
    expect(shareCopy(getShareBoardEn("google-trends")!, at)).toEqual({ dateLine: "Tuesday, October 27, 2026", source: "Source: Google Trends · United States", updated: "Updated 08:13 ET · hourly", empty: "This board is updating. Check back in a few minutes." });
    expect(shareCopy(getShareBoard("google-trends-vn")!, at).updated).toBe("Cập nhật 19:13 (giờ VN) · mỗi giờ một lần");
  });

  it("tidies what dropped scripts leave behind", () => {
    expect(imageSafeTitleEn("ILLIT (아일릿) Official MV")).toBe("ILLIT Official MV");
    expect(imageSafeTitleEn("Pop | 대")).toBe("Pop");
    expect(imageSafeTitleEn("🔴LIVE | AGE OF EMPIRES")).toBe("LIVE | AGE OF EMPIRES");
    expect(imageSafeTitleEn("大谷")).toBe("…");
  });

  it("builds a ready English caption with metrics, link and hashtags", () => {
    const caption = shareCaptionEn(shareData(snap, getShareBoardEn("google-trends")!), "https://surgeindex.lol/");
    expect(caption).toContain("🔥 Top 10 Trending Searches Today (Tuesday, October 27, 2026)");
    expect(caption).toContain("1. search 1 (20K+ searches)");
    expect(caption).toContain("10. search 10");
    expect(caption).not.toContain("11. ");
    expect(caption).toContain("https://surgeindex.lol/top-10/google-trends");
    expect(caption).toContain("Updated 08:13 ET.");
    expect(caption).toContain("#SurgeIndex #Trending #GoogleTrends");
    expect(shareCaptionEn(shareData(snap, getShareBoardEn("ebay")!), "https://surgeindex.lol")).toContain("1. Apple iPhone 13 128GB ($217.79 · 22% off)");
    expect(shareCaptionEn(shareData(snap, getShareBoardEn("amazon")!), "https://surgeindex.lol")).toContain("1. Mighty Patch (Beauty & Personal Care)");
    expect(shareCaptionEn(shareData(snap, getShareBoardEn("youtube")!), "https://surgeindex.lol")).toContain("This board is updating");
  });
});
