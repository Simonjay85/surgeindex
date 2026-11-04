/* eslint-disable @next/next/no-img-element -- generated share PNGs are served by our own route; no optimizer needed */
import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { SharePreview } from "../../components/share/share-preview";
import { CopyCaption } from "../../components/share/copy-caption";
import { TrendShell } from "../../components/trends/ui";
import { etDateLine, etIsoDate, SHARE_BOARDS_EN, SHARE_PAGE_EN, shareCaptionEn, shareData, shareImagePathEn } from "../../lib/share/top10";
import { getLatestSnapshot } from "../../lib/trends/read";

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: "Top 10 Today share images | SurgeIndex" },
  description: "Daily Top 10 share images (1080×1350) with ready English captions for Facebook, Threads, X and TikTok.",
  alternates: { canonical: SHARE_PAGE_EN },
  robots: { index: false, follow: false },
};

export default async function ShareImagesPage() {
  const snapshot = await getLatestSnapshot();
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? "https://surgeindex.lol").replace(/\/$/, "");
  const version = snapshot?.generatedAt ? Date.parse(snapshot.generatedAt) || 0 : 0;
  const slides = SHARE_BOARDS_EN.map((def) => {
    const src = shareImagePathEn(def);
    return { src: `${src}${src.includes("?") ? "&" : "?"}v=${version}`, alt: `${def.title[0]} ${def.title[1]} share image`, label: def.short, color: def.color };
  });
  return (
    <TrendShell generatedAt={snapshot?.generatedAt ?? null}>
      <div className="t-story" lang="en">
        <section className="t-hero is-compact t-story-hero">
          <div className="t-wrap t-share-hero">
            <div>
            <nav className="t-crumbs" aria-label="Breadcrumb">
              <Link href="/">SurgeIndex</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Share images</span>
            </nav>
            <span className="t-kicker t-story-kicker">Internal · not indexed</span>
            <h1 className="t-display is-medium t-story-title">
              Top 10 <em>today</em>
            </h1>
            <p className="t-lede">1080×1350 portrait images (made for Facebook, Threads, X and TikTok feeds) with a ready caption to paste. Images refresh from the latest hourly data. SurgeIndex never posts to any social network on its own.</p>
            </div>
            <SharePreview slides={slides} labels={{ region: "Share image preview", prev: "Previous image", next: "Next image", goTo: "Show" }} />
          </div>
        </section>
        <div className="t-wrap t-share-grid">
          {SHARE_BOARDS_EN.map((def) => {
            const data = shareData(snapshot, def);
            const caption = shareCaptionEn(data, site);
            const src = shareImagePathEn(def);
            const busted = `${src}${src.includes("?") ? "&" : "?"}v=${version}`;
            const file = `surgeindex-top10-${def.id}-${etIsoDate(data.at)}.png`;
            const captionId = `caption-${def.id}`;
            return (
              <article key={def.id} className="t-share-card">
                <h2>
                  {def.title[0]} {def.title[1]}
                </h2>
                <p className="t-share-meta">{data.items.length ? `${data.items.length} items · ${etDateLine(data.at)}` : "No data on this board yet (the image says it is updating)"}</p>
                <a href={busted} target="_blank" rel="noopener" className="t-share-img">
                  <img src={busted} alt={`${def.title[0]} ${def.title[1]} share image`} width={540} height={675} loading="lazy" decoding="async" />
                </a>
                <div className="t-share-actions">
                  <a className="t-share-btn is-primary" href={busted} download={file}>
                    <Download size={15} aria-hidden="true" /> Download PNG
                  </a>
                  <CopyCaption text={caption} id={captionId} labels={{ copy: "Copy caption", copied: "Caption copied" }} />
                </div>
                <label className="t-share-label" htmlFor={captionId}>
                  Caption
                </label>
                <textarea id={captionId} className="t-share-caption" readOnly rows={10} defaultValue={caption} />
              </article>
            );
          })}
        </div>
      </div>
    </TrendShell>
  );
}
