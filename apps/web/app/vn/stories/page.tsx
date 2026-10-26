import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StoryStatusBadge } from "../../../components/stories/story-view";
import { LiveBadge } from "../../../components/stories/live-blog";
import { JsonLd, TrendShell } from "../../../components/trends/ui";
import { listStories } from "../../../lib/stories";
import { siteBase } from "../../../lib/stories/seo";

const TITLE = "Surge Story — những câu chuyện đã qua đỉnh | SurgeIndex VN";
const DESCRIPTION = "Bản ghi lại các câu chuyện mạng xã hội Việt Nam đã qua đỉnh: bắt đầu từ đâu, lan ra sao, và nguồn báo chí cho từng mốc.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/vn/stories" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/vn/stories", locale: "vi_VN", siteName: "SurgeIndex", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/opengraph-image"] },
};

export default function StoriesIndexPage() {
  const stories = listStories("vn");
  const base = siteBase();
  return (
    <TrendShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: TITLE,
          description: DESCRIPTION,
          inLanguage: "vi",
          url: `${base}/vn/stories`,
          hasPart: stories.map((s) => ({ "@type": "Article", headline: s.name, url: `${base}${s.url}`, dateModified: `${s.last_updated}T12:00:00+07:00` })),
        }}
      />
      <div className="t-story" lang="vi">
        <section className="t-hero is-compact t-story-hero">
          <div className="t-wrap">
            <nav className="t-crumbs" aria-label="Breadcrumb">
              <Link href="/">SurgeIndex</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Surge Story</span>
            </nav>
            <span className="t-kicker t-story-kicker">Surge Story · VN</span>
            <h1 className="t-display is-medium t-story-title">
              Câu chuyện <em>đã qua đỉnh.</em>
            </h1>
            <p className="t-lede">Không phải bảng “đang hot” theo giờ. Mỗi Surge Story ghi lại một câu chuyện đã qua đỉnh: bắt đầu từ đâu, lan ra sao, kèm nguồn báo chí cho từng mốc.</p>
          </div>
        </section>
        <div className="t-wrap">
          <ul className="t-story-index">
            {stories.map((s) => (
              <li key={s.url}>
                <Link href={s.url} className="t-story-card">
                  <div className="t-story-card-head">
                    <span className="t-story-card-badges">
                      {s.live ? <LiveBadge resolved={false} size="sm" /> : null}
                      <StoryStatusBadge story={s} size="sm" />
                    </span>
                    <span className="t-story-card-cat">{s.category_label}</span>
                  </div>
                  <h2>{s.name}</h2>
                  {s.aliases.length ? <p className="t-story-card-alias">{s.aliases.join(" · ")}</p> : null}
                  <p className="t-story-card-desc">{s.seo.description}</p>
                  <div className="t-story-card-foot">
                    <span>
                      {s.peak_label} · Cập nhật <time dateTime={s.last_updated}>{s.last_updated_label}</time>
                    </span>
                    <span className="t-story-card-cta">
                      Đọc <ArrowUpRight size={14} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </TrendShell>
  );
}
