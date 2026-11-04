import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Newspaper, Radio } from "lucide-react";
import { formatVnDateTime, type LiveFile, type LiveSource, type PressFile } from "../../lib/live/types";
import type { Story } from "../../lib/stories/schema";
import { LiveRefresh } from "./live-refresh";

const STORY_EXT = { target: "_blank", rel: "nofollow noopener noreferrer" } as const;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SourceLinks({ sources }: { sources: LiveSource[] }) {
  return (
    <ul className="t-live-srcs">
      {sources.map((s) => (
        <li key={s.url}>
          <a href={s.url} {...STORY_EXT}>
            <span className="t-story-src-pub">{s.publisher ?? hostOf(s.url)}</span>
            {s.title ? <span className="t-story-src-title">{s.title}</span> : null}
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** "ĐANG CẬP NHẬT" pill (pulsing) or "ĐÃ KẾT THÚC" once resolved. */
export function LiveBadge({ resolved, size = "md" }: { resolved: boolean; size?: "sm" | "md" }) {
  return resolved ? (
    <span className={`t-live-badge is-done is-${size}`}>
      <CheckCircle2 size={size === "sm" ? 11 : 13} aria-hidden="true" /> Đã kết thúc
    </span>
  ) : (
    <span className={`t-live-badge is-${size}`}>
      <span className="t-live-dot" aria-hidden="true" /> Đang cập nhật
    </span>
  );
}

export function LiveBlog({ story, live, press }: { story: Story; live: LiveFile; press: PressFile | null }) {
  const resolved = live.resolved;
  const pressItems = press?.items.slice(0, 15) ?? [];
  return (
    <section className={`t-live ${resolved ? "is-resolved" : ""}`} aria-labelledby="cap-nhat-truc-tiep">
      {!resolved ? <LiveRefresh /> : null}
      <div className="t-live-head">
        <div>
          <span className="t-kicker">
            <Radio size={13} aria-hidden="true" /> Cập nhật trực tiếp
          </span>
          <h2 id="cap-nhat-truc-tiep" className="t-story-h2">
            {resolved ? "Diễn biến đã khép lại" : "Diễn biến mới nhất"}
          </h2>
        </div>
        <div className="t-live-meta">
          <LiveBadge resolved={Boolean(resolved)} />
          <span>
            Cập nhật lần cuối:{" "}
            {live.updated_at ? <time dateTime={live.updated_at}>{formatVnDateTime(live.updated_at)}</time> : <span>chưa có cập nhật trực tiếp</span>}
          </span>
          {press?.generatedAt ? (
            <span>
              Báo chí quét lúc <time dateTime={press.generatedAt}>{formatVnDateTime(press.generatedAt)}</time>
            </span>
          ) : null}
        </div>
      </div>
      <p className="t-live-rule">Mỗi cập nhật ghi rõ giờ (GMT+7) và có ít nhất một nguồn. Cập nhật mới được thêm lên đầu; cập nhật cũ không bị sửa lại.</p>

      {resolved ? (
        <div className="t-live-final" aria-labelledby="ket-qua">
          <span className="t-kicker">Kết quả / Diễn biến cuối</span>
          <h3 id="ket-qua">
            <time dateTime={resolved.time}>{formatVnDateTime(resolved.time)}</time>
          </h3>
          <p>{resolved.summary}</p>
          <SourceLinks sources={resolved.sources} />
        </div>
      ) : null}

      {live.updates.length ? (
        <ol className="t-live-list">
          {live.updates.map((u) => (
            <li key={u.id} id={u.id} className="t-live-item">
              <span className="t-live-tick" aria-hidden="true" />
              <time className="t-story-when" dateTime={u.time}>
                {formatVnDateTime(u.time)}
              </time>
              <p>{u.text}</p>
              <SourceLinks sources={u.sources} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="t-live-empty">
          <strong>Chưa có cập nhật trực tiếp mới.</strong>
          <p>
            SurgeIndex chỉ đăng cập nhật khi có nguồn kiểm chứng. Các diễn biến đã xác minh trước đó nằm ở <a href="#dong-thoi-gian">Dòng thời gian</a> bên dưới.
          </p>
        </div>
      )}

      <div className="t-live-press" aria-labelledby="bao-chi-noi-gi">
        <div className="t-live-press-head">
          <Newspaper size={16} aria-hidden="true" />
          <h3 id="bao-chi-noi-gi">Báo chí đang nói gì</h3>
          <span>Tự động · khớp từ khóa {story.live_keywords.map((k) => `“${k}”`).join(", ")} trong tiêu đề, quét mỗi giờ</span>
        </div>
        {pressItems.length ? (
          <ul>
            {pressItems.map((p) => (
              <li key={p.url}>
                <a href={p.url} {...STORY_EXT}>
                  <span className="t-story-src-pub">{p.outlet}</span>
                  <span className="t-story-src-title">{p.title}</span>
                  <ArrowUpRight size={13} aria-hidden="true" />
                </a>
                {p.publishedAt ? <time dateTime={p.publishedAt}>{formatVnDateTime(p.publishedAt)}</time> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-live-press-empty">Chưa có tiêu đề mới nào trên RSS các báo lớn khớp từ khóa của câu chuyện này. Danh sách được quét lại mỗi giờ và giữ bài trong 14 ngày.</p>
        )}
        <p className="t-live-press-note">Danh sách tự động từ RSS báo chí; SurgeIndex không kiểm duyệt nội dung từng bài. Xem thêm <Link href="/top-10/news">Báo VN đang nóng</Link>.</p>
      </div>
    </section>
  );
}
