import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { shareFontsDir } from "../lib/share/image";
import { clipTitle, formatViCompact, getShareBoard, imageSafeText, SHARE_BOARDS, shareCaption, shareData, shareImagePath, vnDateLine, vnTime } from "../lib/share/top10";
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
