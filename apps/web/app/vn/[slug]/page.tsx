import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryView } from "../../../components/stories/story-view";
import { JsonLd, TrendShell } from "../../../components/trends/ui";
import { getStory, listStories } from "../../../lib/stories";
import { storyArticleJsonLd, storyBreadcrumbJsonLd, storyFaqJsonLd } from "../../../lib/stories/seo";

// Surge Stories are static archive pages built from apps/web/content/stories.
export const dynamicParams = false;

export function generateStaticParams() {
  return listStories("vn").map((s) => ({ slug: s.slug }));
}

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
  return (
    <TrendShell>
      <JsonLd data={storyArticleJsonLd(story)} />
      <JsonLd data={storyBreadcrumbJsonLd(story)} />
      <JsonLd data={storyFaqJsonLd(story)} />
      <StoryView story={story} />
    </TrendShell>
  );
}
