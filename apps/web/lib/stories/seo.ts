import type { Story } from "./schema";

export function siteBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://surgeindex.lol").replace(/\/$/, "");
}

/** Midday in Vietnam so the date never shifts across time zones. */
function viDateTime(iso: string): string {
  return `${iso}T12:00:00+07:00`;
}

export function storyArticleJsonLd(story: Story, base = siteBase()) {
  const url = `${base}${story.url}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: story.seo.title.split(" | ")[0],
    description: story.seo.description,
    inLanguage: "vi",
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: viDateTime(story.published),
    dateModified: viDateTime(story.last_updated),
    articleSection: story.category_label,
    keywords: [story.name, ...story.aliases, ...story.keywords].join(", "),
    about: {
      "@type": story.entity_type === "person" ? "Person" : "Thing",
      name: story.name,
      ...(story.aliases.length ? { alternateName: story.aliases } : {}),
    },
    mentions: story.related_entities.map((name) => ({ "@type": "Thing", name })),
    citation: story.sources.map((s) => ({ "@type": "CreativeWork", name: s.title, url: s.url, publisher: { "@type": "Organization", name: s.publisher } })),
    author: { "@type": "Organization", name: "SurgeIndex", url: base },
    publisher: { "@type": "Organization", name: "SurgeIndex", url: base, logo: { "@type": "ImageObject", url: `${base}/icon.svg` } },
    image: [`${base}/opengraph-image`],
  };
}

export function storyBreadcrumbJsonLd(story: Story, base = siteBase()) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "SurgeIndex", item: `${base}/` },
      { "@type": "ListItem", position: 2, name: "Surge Story", item: `${base}/vn/stories` },
      { "@type": "ListItem", position: 3, name: story.name, item: `${base}${story.url}` },
    ],
  };
}

export function storyFaqJsonLd(story: Story) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "vi",
    mainEntity: story.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/**
 * LiveBlogPosting for stories in live mode. Updates come from the runtime
 * live file (never rewritten); coverageEndTime is set once resolved.
 */
export function storyLiveBlogJsonLd(story: Story, live: { updates: Array<{ id: string; time: string; text: string; sources: Array<{ url: string }> }>; resolved: { time: string; summary: string } | null; updated_at: string | null }, base = siteBase()) {
  const url = `${base}${story.url}`;
  const article = storyArticleJsonLd(story, base);
  const updates = [
    ...(live.resolved ? [{ id: "ket-qua", time: live.resolved.time, text: live.resolved.summary, sources: [] as Array<{ url: string }> }] : []),
    ...live.updates,
  ];
  return {
    ...article,
    "@type": "LiveBlogPosting",
    dateModified: live.updated_at ?? article.dateModified,
    coverageStartTime: story.live_started_at,
    ...(live.resolved ? { coverageEndTime: live.resolved.time } : {}),
    liveBlogUpdate: updates.slice(0, 50).map((u) => ({
      "@type": "BlogPosting",
      headline: u.text.length > 110 ? `${u.text.slice(0, 107).trimEnd()}…` : u.text,
      articleBody: u.text,
      datePublished: u.time,
      url: `${url}#${u.id}`,
      ...(u.sources.length ? { citation: u.sources.map((s) => s.url) } : {}),
    })),
  };
}
