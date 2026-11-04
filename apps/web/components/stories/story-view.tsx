import Link from "next/link";
import { ArrowUpRight, BellRing, ExternalLink, HeartHandshake, Megaphone } from "lucide-react";
import { brandStyle } from "../trends/ui";
import { formatViDate } from "../../lib/stories";
import { PHASE_LABELS, PLATFORM_COLORS, type Story, type StorySource } from "../../lib/stories/schema";
import type { LiveFile, PressFile } from "../../lib/live/types";
import { TipForm } from "../tips/tip-form";
import { LiveBadge, LiveBlog } from "./live-blog";

/** External links on story pages: never pass ranking signals, never leak opener. */
export const STORY_EXT = { target: "_blank", rel: "nofollow noopener noreferrer" } as const;

const KIND_LABEL: Record<StorySource["kind"], string> = { original: "Bài gốc", republished: "Bản dẫn lại" };

export function StoryStatusBadge({ story, size = "md" }: { story: Story; size?: "sm" | "md" }) {
  return (
    <span className={`t-story-badge is-${story.status} is-${size}`}>
      <span className="t-story-badge-dot" aria-hidden="true" />
      {story.badge.label}
    </span>
  );
}

export interface StoryViewProps {
  story: Story;
  /** Runtime live-blog data when story.live is true. */
  live?: { file: LiveFile; press: PressFile | null };
  tipSiteKey?: string;
  donateEnabled?: boolean;
}

export function StoryView({ story, live, tipSiteKey, donateEnabled = false }: StoryViewProps) {
  const signals = [...story.signals].sort((a, b) => a.order - b.order);
  const firstSignal = signals.find((s) => s.platform === story.first_signal_platform);
  return (
    <article className="t-story" lang="vi">
      <header className="t-hero is-compact t-story-hero">
        <div className="t-wrap">
          <nav className="t-crumbs" aria-label="Breadcrumb">
            <Link href="/">SurgeIndex</Link>
            <span aria-hidden="true">/</span>
            <Link href="/vn/stories">Surge Story</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{story.name}</span>
          </nav>
          <span className="t-kicker t-story-kicker">Surge Story · {story.category_label}</span>
          <h1 className="t-display is-medium t-story-title">{story.name}</h1>
          {story.aliases.length || story.keywords.length ? (
            <p className="t-story-aliases">
              {story.aliases.length ? (
                <>
                  <span className="t-story-meta-label">Biệt danh</span> {story.aliases.join(", ")}
                </>
              ) : null}
              {story.aliases.length && story.keywords.length ? <span aria-hidden="true"> · </span> : null}
              {story.keywords.length ? (
                <>
                  <span className="t-story-meta-label">Từ khóa</span> {story.keywords.join(", ")}
                </>
              ) : null}
            </p>
          ) : null}

          <div className="t-story-status">
            {live ? <LiveBadge resolved={Boolean(live.file.resolved)} /> : null}
            <StoryStatusBadge story={story} />
            <p>{story.badge.explanation}</p>
          </div>

          <dl className="t-story-facts">
            <div>
              <dt>Thực thể</dt>
              <dd>{story.entity_label}</dd>
            </div>
            <div>
              <dt>Cửa sổ đỉnh</dt>
              <dd>{story.peak_window_label}</dd>
            </div>
            <div>
              <dt>Mức nóng</dt>
              <dd>{story.peak_label}</dd>
            </div>
            <div>
              <dt>Cập nhật lần cuối</dt>
              <dd>
                <time dateTime={story.last_updated}>{story.last_updated_label}</time>
              </dd>
            </div>
          </dl>
          {story.related_entities.length ? (
            <p className="t-story-related">
              <span className="t-story-meta-label">Liên quan</span>
              {story.related_entities.map((e) => (
                <span key={e} className="t-story-tag">
                  {e}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </header>

      <div className="t-wrap t-story-body">
        <section className="t-story-answer" aria-labelledby="tra-loi-nhanh">
          <h2 id="tra-loi-nhanh" className="t-kicker">
            Trả lời nhanh
          </h2>
          <p>{story.quick_answer}</p>
        </section>
        <p className="t-story-disclaimer">{story.disclaimer}</p>

        {live ? <LiveBlog story={story} live={live.file} press={live.press} /> : null}

        <section className="t-story-section" aria-labelledby="ban-do-tin-hieu">
          <span className="t-kicker">Bản đồ tín hiệu</span>
          <h2 id="ban-do-tin-hieu" className="t-story-h2">
            {story.signals_title}
          </h2>
          <p className="t-story-intro">{story.signals_intro}</p>
          <ol className="t-story-signals">
            {signals.map((s) => (
              <li key={s.order} className={`t-story-signal is-${s.phase}`} style={brandStyle(PLATFORM_COLORS[s.platform])}>
                <span className="t-story-signal-num" aria-hidden="true">
                  {String(s.order).padStart(2, "0")}
                </span>
                <div className="t-story-signal-body">
                  <div className="t-story-signal-head">
                    <h3>
                      <span className="sr-only">Bước {s.order}: </span>
                      {s.label}
                    </h3>
                    <span className="t-story-chip">{s.platform_label}</span>
                    <span className={`t-story-phase is-${s.phase}`}>{PHASE_LABELS[s.phase]}</span>
                  </div>
                  <p>{s.note}</p>
                  {s.source_url ? (
                    <a className="t-story-inline-src" href={s.source_url} {...STORY_EXT}>
                      Xem bài báo <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {firstSignal ? <p className="t-story-footnote">Tín hiệu đầu tiên: {firstSignal.platform_label}.</p> : null}
        </section>

        <aside className="t-story-lesson" aria-labelledby="bai-hoc">
          <h2 id="bai-hoc" className="t-kicker">
            {story.lessons.title}
          </h2>
          <p>{story.lessons.body}</p>
        </aside>

        <section className="t-story-section" aria-labelledby="dong-thoi-gian">
          <span className="t-kicker">Timeline</span>
          <h2 id="dong-thoi-gian" className="t-story-h2">
            Dòng thời gian
          </h2>
          <ol className="t-story-timeline">
            {story.timeline.map((m) => (
              <li key={m.id} id={m.id} className="t-story-milestone">
                <span className="t-story-dot" aria-hidden="true" />
                <time className="t-story-when" dateTime={m.date}>
                  {m.date_label}
                </time>
                <h3>{m.title}</h3>
                <ul>
                  {m.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                {m.note ? <p className="t-story-note">{m.note}</p> : null}
                <div className="t-story-srcs">
                  <span className="t-story-meta-label">Nguồn</span>
                  <ul>
                    {m.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} {...STORY_EXT}>
                          <span className="t-story-src-pub">{s.publisher}</span>
                          <span className="t-story-src-title">{s.title}</span>
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </a>
                        {s.role === "secondary" ? <span className="t-story-src-role">nguồn phụ</span> : null}
                      </li>
                    ))}
                  </ul>
                  {m.source_note ? <p className="t-story-src-note">{m.source_note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="t-story-section" aria-labelledby="hoi-dap">
          <span className="t-kicker">FAQ</span>
          <h2 id="hoi-dap" className="t-story-h2">
            Câu hỏi thường gặp
          </h2>
          <div className="t-story-faq">
            {story.faq.map((f, i) => (
              <details key={f.q} open={i === 0}>
                <summary>
                  <h3>{f.q}</h3>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {story.follow_up.length ? (
          <section className="t-story-section" aria-labelledby="theo-doi-tiep">
            <span className="t-kicker">Đang theo dõi</span>
            <h2 id="theo-doi-tiep" className="t-story-h2">
              Theo dõi tiếp
            </h2>
            <ul className="t-story-follow">
              {story.follow_up.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="t-story-section" aria-labelledby="nguon">
          <span className="t-kicker">Tham khảo</span>
          <h2 id="nguon" className="t-story-h2">
            Nguồn
          </h2>
          {story.sources_note ? <p className="t-story-intro">{story.sources_note}</p> : null}
          <ol className="t-story-sources">
            {story.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} {...STORY_EXT} hrefLang={s.lang}>
                  <span className="t-story-src-pub">{s.publisher}</span>
                  <span className="t-story-src-title">{s.title}</span>
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
                <span className="t-story-src-meta">
                  {KIND_LABEL[s.kind]}
                  {s.lang !== "vi" ? ` · ${s.lang.toUpperCase()}` : ""}
                  {s.date ? ` · ${formatViDate(s.date)}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {live ? (
          <section className="t-story-section t-tip-section" aria-labelledby="gui-tin">
            <span className="t-kicker">
              <Megaphone size={13} aria-hidden="true" /> Gửi tin nóng
            </span>
            <h2 id="gui-tin" className="t-story-h2">
              Bạn có thông tin? Gửi cho chúng tôi
            </h2>
            <p className="t-story-intro">Gửi kèm link nguồn (bài báo, bài đăng công khai). Mọi tin được kiểm tra thủ công trước khi trở thành một cập nhật; không có gì được đăng tự động.</p>
            <TipForm siteKey={tipSiteKey} page={story.url} compact />
          </section>
        ) : null}

        {donateEnabled ? (
          <Link href="/vn/ung-ho" className="t-donate-strip">
            <HeartHandshake size={18} aria-hidden="true" />
            <span>
              <strong>Ủng hộ SurgeIndex</strong> — giúp chúng tôi tiếp tục theo dõi, kiểm chứng và ghi lại các câu chuyện như thế này.
            </span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        ) : null}

        <section className="t-story-cta" aria-labelledby="ban-tin">
          <span className="t-story-cta-icon" aria-hidden="true">
            <BellRing size={20} />
          </span>
          <div>
            <h2 id="ban-tin">{story.newsletter.title}</h2>
            <p>Bản tin email buổi sáng đang được chuẩn bị. Chưa nhận đăng ký.</p>
          </div>
          <button type="button" className="t-story-cta-btn" disabled aria-disabled="true">
            {story.newsletter.label}
          </button>
        </section>
      </div>
    </article>
  );
}
