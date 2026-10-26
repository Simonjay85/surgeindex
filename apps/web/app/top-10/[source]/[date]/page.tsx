import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SourceView } from "../../../../components/trends/source-view";
import { itemListJsonLd, JsonLd, TrendShell } from "../../../../components/trends/ui";
import { formatLongDate } from "../../../../lib/trends/format";
import { findBoard, getDailySnapshot, isArchiveDate, listArchiveDates } from "../../../../lib/trends/read";
import { getSourceMeta, type TrendBoard } from "../../../../lib/trends/types";

// Past days never change; today's archive keeps filling until midnight UTC.
export const revalidate = 1800;

export function generateStaticParams() {
  return [];
}

function clip(t: string): string {
  return t.length > 80 ? `${t.slice(0, 77).trimEnd()}…` : t;
}

export async function generateMetadata({ params }: { params: Promise<{ source: string; date: string }> }): Promise<Metadata> {
  const { source, date } = await params;
  const meta = getSourceMeta(source);
  if (!meta || !isArchiveDate(date)) return {};
  const snapshot = await getDailySnapshot(date);
  const first = findBoard(snapshot, meta.key)?.items[0];
  const title = `Top 10 on ${meta.name} — ${formatLongDate(date)}`;
  const description = `What was trending on ${meta.name} on ${formatLongDate(date)}${first ? `, led by “${clip(first.title)}”` : ""}. Daily Top 10 archive with Heat Scores.`;
  return {
    title,
    description,
    alternates: { canonical: `/top-10/${meta.key}/${date}` },
    openGraph: { title: `${title} · SurgeIndex`, description, type: "article", url: `/top-10/${meta.key}/${date}`, images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: `${title} · SurgeIndex`, description, images: ["/opengraph-image"] },
    robots: meta.comingSoon ? { index: false, follow: true } : undefined,
  };
}

export default async function ArchivePage({ params }: { params: Promise<{ source: string; date: string }> }) {
  const { source, date } = await params;
  const meta = getSourceMeta(source);
  if (!meta || !isArchiveDate(date)) notFound();
  const [snapshot, dates] = await Promise.all([getDailySnapshot(date), listArchiveDates()]);
  if (!snapshot) notFound();
  const boards = meta.regions.map((r) => findBoard(snapshot, meta.key, r)).filter((b): b is TrendBoard => Boolean(b));
  const shown: TrendBoard[] = boards.length ? boards : [{ id: meta.key, source: meta.key, region: "global", status: meta.comingSoon ? "soon" : "unavailable", fetchedAt: null, items: [] }];
  const idx = dates.indexOf(date);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://surgeindex.lol").replace(/\/$/, "");
  const primary = shown[0]!;
  return (
    <TrendShell generatedAt={snapshot.generatedAt}>
      {primary.items.length ? <JsonLd data={itemListJsonLd(`Top 10 on ${meta.name} — ${formatLongDate(date)}`, `${base}/top-10/${meta.key}/${date}`, primary.items)} /> : null}
      <SourceView meta={meta} boards={shown} generatedAt={snapshot.generatedAt} archiveDates={dates} archiveDate={date} prevDate={idx >= 0 ? dates[idx + 1] ?? null : null} nextDate={idx > 0 ? dates[idx - 1] ?? null : null} />
    </TrendShell>
  );
}
