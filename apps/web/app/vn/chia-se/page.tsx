/* eslint-disable @next/next/no-img-element -- generated share PNGs are served by our own route; no optimizer needed */
import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { SharePreview } from "../../../components/share/share-preview";
import { CopyCaption } from "../../../components/share/copy-caption";
import { TrendShell } from "../../../components/trends/ui";
import { SHARE_BOARDS, SHARE_PAGE, shareCaption, shareData, shareImagePath, vnDateLine } from "../../../lib/share/top10";
import { getLatestSnapshot } from "../../../lib/trends/read";

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: "Ảnh chia sẻ Top 10 hôm nay | SurgeIndex VN" },
  description: "Ảnh Top 10 hôm nay (1080×1350) kèm caption tiếng Việt để đăng Facebook, Threads, TikTok.",
  alternates: { canonical: SHARE_PAGE },
  robots: { index: false, follow: false },
};

export default async function SharePage() {
  const snapshot = await getLatestSnapshot();
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? "https://surgeindex.lol").replace(/\/$/, "");
  const version = snapshot?.generatedAt ? Date.parse(snapshot.generatedAt) || 0 : 0;
  const slides = SHARE_BOARDS.map((def) => {
    const src = shareImagePath(def);
    return { src: `${src}${src.includes("?") ? "&" : "?"}v=${version}`, alt: `Ảnh ${def.title[0]} ${def.title[1]}`, label: def.short, color: def.color };
  });
  return (
    <TrendShell generatedAt={snapshot?.generatedAt ?? null}>
      <div className="t-story" lang="vi">
        <section className="t-hero is-compact t-story-hero">
          <div className="t-wrap t-share-hero">
            <div>
            <nav className="t-crumbs" aria-label="Breadcrumb">
              <Link href="/">SurgeIndex</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Ảnh chia sẻ</span>
            </nav>
            <span className="t-kicker t-story-kicker">Nội bộ · không index</span>
            <h1 className="t-display is-medium t-story-title">
              Top 10 <em>hôm nay</em>
            </h1>
            <p className="t-lede">Ảnh 1080×1350 (dọc, hợp feed Facebook, Threads, TikTok) và caption sẵn để dán. Ảnh tự cập nhật theo dữ liệu mới nhất mỗi giờ. SurgeIndex không tự đăng lên mạng xã hội nào.</p>
            </div>
            <SharePreview slides={slides} labels={{ region: "Xem trước ảnh chia sẻ", prev: "Ảnh trước", next: "Ảnh tiếp", goTo: "Xem ảnh" }} />
          </div>
        </section>
        <div className="t-wrap t-share-grid">
          {SHARE_BOARDS.map((def) => {
            const data = shareData(snapshot, def);
            const caption = shareCaption(data, site);
            const src = shareImagePath(def);
            const busted = `${src}${src.includes("?") ? "&" : "?"}v=${version}`;
            const file = `surgeindex-top10-${def.id}-${vnDateLine(data.at).split(", ")[1]!.split("/").reverse().join("-")}.png`;
            const captionId = `caption-${def.id}`;
            return (
              <article key={def.id} className="t-share-card">
                <h2>
                  {def.title[0]} {def.title[1]}
                </h2>
                <p className="t-share-meta">
                  {data.items.length ? `${data.items.length} mục · ${vnDateLine(data.at)}` : "Board chưa có dữ liệu (ảnh sẽ báo đang cập nhật)"}
                </p>
                <a href={busted} target="_blank" rel="noopener" className="t-share-img">
                  <img src={busted} alt={`Ảnh ${def.title[0]} ${def.title[1]}`} width={540} height={675} loading="lazy" decoding="async" />
                </a>
                <div className="t-share-actions">
                  <a className="t-share-btn is-primary" href={busted} download={file}>
                    <Download size={15} aria-hidden="true" /> Tải ảnh PNG
                  </a>
                  <CopyCaption text={caption} id={captionId} />
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
