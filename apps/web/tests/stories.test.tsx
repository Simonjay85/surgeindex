import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StoryView } from "../components/stories/story-view";
import { getStory, listStories, STORIES } from "../lib/stories";
import { storySchema } from "../lib/stories/schema";
import { storyArticleJsonLd, storyBreadcrumbJsonLd, storyFaqJsonLd } from "../lib/stories/seo";
import { SOURCE_KEYS } from "../lib/trends/types";
import truongGiang from "../content/stories/vn/truong-giang.json";

describe("Surge Story content", () => {
  afterEach(() => cleanup());

  it("loads every story through the schema", () => {
    expect(STORIES.length).toBeGreaterThan(0);
    for (const story of STORIES) expect(storySchema.safeParse(story).success).toBe(true);
  });

  it("keeps stories out of Top 10 boards and never carries a Heat Score", () => {
    for (const story of STORIES) {
      expect(story.exclude_from_boards).toBe(true);
      expect(story.show_heat_score).toBe(false);
      expect((SOURCE_KEYS as readonly string[]).includes(story.slug)).toBe(false);
    }
  });

  it("gives every milestone at least one external https source listed in the sources section", () => {
    for (const story of STORIES) {
      expect(story.timeline.length).toBeGreaterThanOrEqual(4);
      const listed = new Set(story.sources.map((s) => s.url));
      for (const m of story.timeline) {
        expect(m.sources.length).toBeGreaterThanOrEqual(1);
        for (const s of m.sources) {
          expect(s.url.startsWith("https://")).toBe(true);
          expect(listed.has(s.url)).toBe(true);
        }
      }
    }
  });

  it("rejects a milestone without sources and a live heat score", () => {
    const noSource = structuredClone(truongGiang) as Record<string, unknown> & { timeline: Array<{ sources: unknown[] }> };
    noSource.timeline[0]!.sources = [];
    expect(storySchema.safeParse(noSource).success).toBe(false);
    expect(storySchema.safeParse({ ...truongGiang, show_heat_score: true }).success).toBe(false);
    expect(storySchema.safeParse({ ...truongGiang, slug: "stories", url: "/vn/stories" }).success).toBe(false);
  });

  it("resolves the Trường Giang story by slug", () => {
    const story = getStory("vn", "truong-giang");
    expect(story?.url).toBe("/vn/truong-giang");
    expect(listStories("vn").some((s) => s.slug === "truong-giang")).toBe(true);
    expect(getStory("vn", "does-not-exist")).toBeUndefined();
  });
});

describe("StoryView", () => {
  afterEach(() => cleanup());
  const story = getStory("vn", "truong-giang")!;

  it("renders the sections in order with Vietnamese content and no Heat Score", () => {
    const { container } = render(<StoryView story={story} />);
    const article = container.querySelector("article");
    expect(article).toHaveAttribute("lang", "vi");
    expect(screen.getByRole("heading", { level: 1, name: "Trường Giang" })).toBeInTheDocument();
    expect(screen.getByText("Đã qua đỉnh · Dư âm")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/heat score/i);
    const ids = Array.from(container.querySelectorAll("h2[id]")).map((h) => h.id);
    expect(ids).toEqual(["tra-loi-nhanh", "ban-do-tin-hieu", "bai-hoc", "dong-thoi-gian", "hoi-dap", "theo-doi-tiep", "nguon", "ban-tin"]);
    expect(container.querySelectorAll(".t-story-milestone")).toHaveLength(story.timeline.length);
    expect(container.querySelectorAll(".t-story-faq details")).toHaveLength(story.faq.length);
  });

  it("marks every external link nofollow noopener with a new tab", () => {
    const { container } = render(<StoryView story={story} />);
    const external = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[href^='http']"));
    expect(external.length).toBeGreaterThan(0);
    for (const a of external) {
      expect(a.target).toBe("_blank");
      expect(a.rel).toContain("nofollow");
      expect(a.rel).toContain("noopener");
    }
  });

  it("renders the newsletter CTA as a disabled coming-soon button without a form", () => {
    const { container } = render(<StoryView story={story} />);
    const cta = container.querySelector(".t-story-cta") as HTMLElement;
    expect(within(cta).getByRole("button", { name: "Sắp ra mắt" })).toBeDisabled();
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("Surge Story JSON-LD", () => {
  const story = getStory("vn", "truong-giang")!;
  it("builds Article, BreadcrumbList and FAQPage", () => {
    const article = storyArticleJsonLd(story, "https://surgeindex.lol");
    expect(article["@type"]).toBe("Article");
    expect(article.dateModified).toBe("2026-10-26T12:00:00+07:00");
    expect(article.url).toBe("https://surgeindex.lol/vn/truong-giang");
    expect(storyBreadcrumbJsonLd(story, "https://surgeindex.lol").itemListElement).toHaveLength(3);
    const faq = storyFaqJsonLd(story);
    expect(faq.mainEntity).toHaveLength(story.faq.length);
  });
});
