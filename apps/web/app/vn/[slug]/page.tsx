import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryView } from "../../../components/stories/story-view";
import { JsonLd, TrendShell } from "../../../components/trends/ui";
import { getStory } from "../../../lib/stories";
import { storyArticleJsonLd, storyBreadcrumbJsonLd, storyFaqJsonLd, storyLiveBlogJsonLd } from "../../../lib/stories/seo";
import { readLiveFile, readPressFile } from "../../../lib/live/store";

// Surge Stories are built from apps/web/content/stories. Live stories also read
// <LIVE_DATA_DIR>/<slug>(.press).json, so the page renders per request (two
// small JSON reads): a POST to /api/live/<slug> shows up immediately, no rebuild.
// Unknown slugs hit notFound(). (ISR + revalidatePath, or dynamicParams=false,
// both 404 a dynamically rendered story on Next 16.)
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const story = getStory("vn", slug);
  if (!story) return {};
  const { title, description } = story.seo;
  return {
    title: { absolute: title },
    description,
    keywords: [story.name, ...story.aliases, ...story.keywords, ...story.related_entities],
    alternates: { canonical: story.url },
    openGraph: {
      title,
      description,
      type: "article",
      url: story.url,
      locale: "vi_VN",
      siteName: "SurgeIndex",
      publishedTime: `${story.published}T12:00:00+07:00`,
      modifiedTime: `${story.last_updated}T12:00:00+07:00`,
      section: story.category_label,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
  };
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = getStory("vn", slug);
  if (!story) notFound();
  const live = story.live ? { file: await readLiveFile(story.slug), press: await readPressFile(story.slug) } : undefined;
  return (
    <TrendShell>
      <JsonLd data={live ? storyLiveBlogJsonLd(story, live.file) : storyArticleJsonLd(story)} />
      <JsonLd data={storyBreadcrumbJsonLd(story)} />
      <JsonLd data={storyFaqJsonLd(story)} />
      <StoryView story={story} live={live} />
    </TrendShell>
  );
}
