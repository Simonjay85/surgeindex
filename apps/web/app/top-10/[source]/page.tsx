import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SourceView } from "../../../components/trends/source-view";
import { itemListJsonLd, JsonLd, TrendShell } from "../../../components/trends/ui";
import { findBoard, getLatestSnapshot, listArchiveDates } from "../../../lib/trends/read";
import { getSourceMeta, getSourceMetaByBoardId, primaryRegion, SOURCE_KEYS, type SourceMeta, type TrendBoard, type TrendSnapshot } from "../../../lib/trends/types";

export const revalidate = 300;

export function generateStaticParams() {
  return SOURCE_KEYS.map((source) => ({ source }));
}

/** `/top-10/<key>` or, for single-region sources, `/top-10/<board id>` (e.g. tiktok-shop-vn). */
function resolveMeta(slug: string): SourceMeta | undefined {
  return getSourceMeta(slug) ?? getSourceMetaByBoardId(slug);
}

/** Boards with nothing to show yet ("Coming soon": planned, or API key not set) stay out of search results. */
function isEmptyBoard(snapshot: TrendSnapshot | null, meta: SourceMeta): boolean {
  if (meta.comingSoon) return true;
  const boards = meta.regions.map((r) => findBoard(snapshot, meta.key, r));
  return boards.every((b) => !b || (b.status === "soon" && !b.items.length));
}

function clip(t: string): string {
  return t.length > 80 ? `${t.slice(0, 77).trimEnd()}…` : t;
}

export async function generateMetadata({ params }: { params: Promise<{ source: string }> }): Promise<Metadata> {
  const { source } = await params;
  const meta = resolveMeta(source);
  if (!meta) return {};
  const snapshot = await getLatestSnapshot();
  const first = findBoard(snapshot, meta.key, primaryRegion(meta))?.items[0];
  const title = `Top 10 trending on ${meta.name} right now`;
  const description = `${meta.description}${first ? ` #1 right now: “${clip(first.title)}”.` : ""} Updated every hour.`;
  return {
    title,
    description,
    alternates: { canonical: `/top-10/${meta.key}` },
    openGraph: { title: `${title} · SurgeIndex`, description, type: "website", url: `/top-10/${meta.key}`, images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: `${title} · SurgeIndex`, description, images: ["/opengraph-image"] },
    robots: isEmptyBoard(snapshot, meta) ? { index: false, follow: true } : undefined,
  };
}

export default async function SourcePage({ params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const meta = resolveMeta(source);
  if (!meta) notFound();
  const [snapshot, dates] = await Promise.all([getLatestSnapshot(), listArchiveDates()]);
  const boards = meta.regions.map((r) => findBoard(snapshot, meta.key, r)).filter((b): b is TrendBoard => Boolean(b));
  const shown: TrendBoard[] = boards.length ? boards : [{ id: meta.key, source: meta.key, region: primaryRegion(meta), status: meta.comingSoon ? "soon" : "unavailable", fetchedAt: null, items: [] }];
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://surgeindex.lol").replace(/\/$/, "");
  const primary = shown[0]!;
  return (
    <TrendShell generatedAt={snapshot?.generatedAt ?? null}>
      {primary.items.length ? <JsonLd data={itemListJsonLd(`Top 10 trending on ${meta.name}`, `${base}/top-10/${meta.key}`, primary.items)} /> : null}
      <SourceView meta={meta} boards={shown} generatedAt={snapshot?.generatedAt ?? null} archiveDates={meta.comingSoon ? [] : dates} />
    </TrendShell>
  );
}
