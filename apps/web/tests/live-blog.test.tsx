import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoryView } from "../components/stories/story-view";
import { checkLiveAdmin } from "../lib/live/auth";
import { buildPressFile, matchKeyword } from "../lib/live/press";
import { appendLive, readLiveFile, readPressFile, writePressFile } from "../lib/live/store";
import { livePostSchema, toVnIso } from "../lib/live/types";
import { getStory } from "../lib/stories";
import { storySchema } from "../lib/stories/schema";
import { storyLiveBlogJsonLd } from "../lib/stories/seo";
import { updateLivePress } from "../lib/trends/ingest";
import type { NewsArticle } from "../lib/trends/news";
import truongGiang from "../content/stories/vn/truong-giang.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const NOW = Date.parse("2026-10-27T03:00:00Z");
let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "si-live-"));
});
afterEach(async () => {
  cleanup();
  await rm(dir, { recursive: true, force: true });
});

const req = (auth?: string) => new Request("https://surgeindex.lol/api/live/truong-giang", { method: "POST", headers: auth ? { authorization: auth } : {} });

describe("live admin token", () => {
  it("returns 503 when LIVE_ADMIN_TOKEN is unset and 401 for a wrong or missing token", () => {
    expect(checkLiveAdmin(req("Bearer x"), undefined)).toMatchObject({ ok: false, status: 503 });
    expect(checkLiveAdmin(req("Bearer x"), "  ")).toMatchObject({ ok: false, status: 503 });
    expect(checkLiveAdmin(req(), "secret-token")).toMatchObject({ ok: false, status: 401 });
    expect(checkLiveAdmin(req("Bearer nope"), "secret-token")).toMatchObject({ ok: false, status: 401 });
    expect(checkLiveAdmin(req("Bearer secret-token"), "secret-token")).toEqual({ ok: true });
  });
});

describe("live updates store", () => {
  it("formats Vietnam time with +07:00", () => {
    expect(toVnIso(NOW)).toBe("2026-10-27T10:00:00+07:00");
  });

  it("requires a source URL (https) for every update", () => {
    expect(livePostSchema.safeParse({ action: "update", text: "x", sources: [] }).success).toBe(false);
    expect(livePostSchema.safeParse({ action: "update", text: "x", sources: ["http://insecure.vn/a"] }).success).toBe(false);
    expect(livePostSchema.safeParse({ action: "update", text: "x", sources: ["https://vnexpress.net/a.html"] }).success).toBe(true);
    expect(livePostSchema.safeParse({ action: "update", text: "x", sources: ["https://a.vn"], time: "2026-10-27 10:00" }).success).toBe(false);
  });

  it("appends updates newest first, never rewrites old ones, and resolves once", async () => {
    expect((await readLiveFile("truong-giang", dir)).updates).toEqual([]);
    await appendLive("truong-giang", { action: "update", text: "Cập nhật một", sources: ["https://vnexpress.net/a.html"], time: "2026-10-27T09:00:00+07:00" }, NOW, dir);
    const after = await appendLive("truong-giang", { action: "update", text: "Cập nhật hai", sources: [{ url: "https://tuoitre.vn/b.htm", publisher: "Tuổi Trẻ" }] }, NOW + 60_000, dir);
    expect(after.updates.map((u) => u.text)).toEqual(["Cập nhật hai", "Cập nhật một"]);
    expect(after.updates[0]!.time).toBe("2026-10-27T10:01:00+07:00");
    expect(after.updated_at).toBe("2026-10-27T10:01:00+07:00");
    const resolved = await appendLive("truong-giang", { action: "resolve", summary: "Kết thúc.", sources: ["https://dantri.com.vn/c.htm"] }, NOW + 120_000, dir);
    expect(resolved.resolved?.summary).toBe("Kết thúc.");
    expect(resolved.updates).toHaveLength(2);
    await expect(appendLive("truong-giang", { action: "resolve", summary: "Lần hai", sources: ["https://a.vn/x"] }, NOW, dir)).rejects.toMatchObject({ code: "already_resolved" });
    const onDisk = JSON.parse(await readFile(path.join(dir, "truong-giang.json"), "utf8"));
    expect(onDisk.updates[1].text).toBe("Cập nhật một");
  });

  it("rejects slugs that could escape the data directory", async () => {
    await expect(readLiveFile("../etc/passwd", dir)).resolves.toMatchObject({ updates: [] });
    await expect(appendLive("../x", { action: "update", text: "x", sources: ["https://a.vn/x"] }, NOW, dir)).rejects.toThrow(/invalid slug/);
  });
});

describe("Báo chí đang nói gì (press matching)", () => {
  const a = (title: string, outlet = "VnExpress", url = `https://vnexpress.net/${encodeURIComponent(title)}.html`): NewsArticle => ({ title, url, outlet, publishedAt: "2026-10-27T01:00:00.000Z", feed: "t", direct: true });

  it("matches keywords as whole phrases without diacritics", () => {
    expect(matchKeyword("TRƯỜNG GIANG trở lại 2 Ngày 1 Đêm?", ["Trường Giang"])).toBe("Trường Giang");
    expect(matchKeyword("Show 2 ngày 1 đêm tập mới", ["Trường Giang", "2 ngày 1 đêm"])).toBe("2 ngày 1 đêm");
    expect(matchKeyword("Trường Giangs không liên quan", ["Trường Giang"])).toBeNull();
    expect(matchKeyword("Giá vàng hôm nay", ["Trường Giang"])).toBeNull();
  });

  it("accumulates matches across runs, dedupes outlet+headline and keeps first-seen", () => {
    const first = buildPressFile("truong-giang", ["Trường Giang"], [a("Trường Giang nói gì"), a("Tin khác")], null, NOW);
    expect(first.items).toHaveLength(1);
    const second = buildPressFile("truong-giang", ["Trường Giang"], [a("Trường Giang nói gì", "VnExpress", "https://news.google.com/rss/articles/x"), a("Trường Giang lên tiếng", "Dân Trí")], first, NOW + 3_600_000);
    expect(second.items.map((i) => i.title).sort()).toEqual(["Trường Giang lên tiếng", "Trường Giang nói gì"]);
    expect(second.items.find((i) => i.title === "Trường Giang nói gì")!.url).toContain("vnexpress.net");
    expect(second.items.find((i) => i.title === "Trường Giang nói gì")!.firstSeen).toBe(new Date(NOW).toISOString());
  });

  it("writes press files for every live story during ingest", async () => {
    await updateLivePress([a("Trường Giang xuất hiện tại sự kiện")], NOW, () => {}, dir);
    const press = await readPressFile("truong-giang", dir);
    expect(press?.items[0]?.title).toBe("Trường Giang xuất hiện tại sự kiện");
    await writePressFile({ slug: "truong-giang", generatedAt: new Date(NOW).toISOString(), items: [] }, dir);
    expect((await readPressFile("truong-giang", dir))?.items).toEqual([]);
  });
});

describe("live Surge Story", () => {
  const story = getStory("vn", "truong-giang")!;

  it("marks Trường Giang live with keywords and requires both for live stories", () => {
    expect(story.live).toBe(true);
    expect(story.live_keywords).toEqual(expect.arrayContaining(["Trường Giang", "2 ngày 1 đêm"]));
    expect(storySchema.safeParse({ ...truongGiang, live_keywords: [] }).success).toBe(false);
    expect(storySchema.safeParse({ ...truongGiang, live_started_at: undefined }).success).toBe(false);
    expect(storySchema.safeParse({ ...truongGiang, slug: "ung-ho", url: "/vn/ung-ho" }).success).toBe(false);
  });

  it("emits LiveBlogPosting JSON-LD with coverage times and updates", () => {
    const open = storyLiveBlogJsonLd(story, { updates: [{ id: "u1", time: "2026-10-27T09:00:00+07:00", text: "Một cập nhật", sources: [{ url: "https://vnexpress.net/a.html" }] }], resolved: null, updated_at: "2026-10-27T09:00:00+07:00" }, "https://surgeindex.lol");
    expect(open["@type"]).toBe("LiveBlogPosting");
    expect(open.coverageStartTime).toBe(story.live_started_at);
    expect(open).not.toHaveProperty("coverageEndTime");
    expect(open.liveBlogUpdate[0]).toMatchObject({ "@type": "BlogPosting", datePublished: "2026-10-27T09:00:00+07:00", url: "https://surgeindex.lol/vn/truong-giang#u1" });
    const done = storyLiveBlogJsonLd(story, { updates: [], resolved: { time: "2026-10-28T10:00:00+07:00", summary: "Kết thúc" }, updated_at: "2026-10-28T10:00:00+07:00" });
    expect(done.coverageEndTime).toBe("2026-10-28T10:00:00+07:00");
  });

  it("renders the live badge, empty state and press list; shows the final section once resolved", () => {
    const { unmount } = render(<StoryView story={story} live={{ file: { slug: story.slug, updates: [], resolved: null, updated_at: null }, press: null }} />);
    expect(screen.getAllByText("Đang cập nhật").length).toBeGreaterThan(0);
    expect(screen.getByText("Chưa có cập nhật trực tiếp mới.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Báo chí đang nói gì" })).toBeInTheDocument();
    unmount();
    render(
      <StoryView
        story={story}
        live={{
          file: { slug: story.slug, updates: [{ id: "u1", time: "2026-10-27T09:00:00+07:00", text: "Cập nhật có nguồn", sources: [{ url: "https://vnexpress.net/a.html" }], posted_at: "2026-10-27T09:00:00+07:00" }], resolved: { time: "2026-10-28T10:00:00+07:00", summary: "Diễn biến cuối cùng", sources: [{ url: "https://dantri.com.vn/x.htm" }], posted_at: "2026-10-28T10:00:00+07:00" }, updated_at: "2026-10-28T10:00:00+07:00" },
          press: { slug: story.slug, generatedAt: "2026-10-27T03:00:00.000Z", items: [{ title: "Bài báo khớp", url: "https://tuoitre.vn/a.htm", outlet: "Tuổi Trẻ", publishedAt: "2026-10-27T01:00:00.000Z", matched: "Trường Giang", firstSeen: "2026-10-27T03:00:00.000Z" }] },
        }}
      />,
    );
    expect(screen.getByText("Kết quả / Diễn biến cuối")).toBeInTheDocument();
    expect(screen.getByText("Diễn biến cuối cùng")).toBeInTheDocument();
    expect(screen.getByText("Cập nhật có nguồn")).toBeInTheDocument();
    expect(screen.getByText("Bài báo khớp")).toBeInTheDocument();
    expect(screen.getAllByText("Đã kết thúc").length).toBeGreaterThan(0);
  });
});
