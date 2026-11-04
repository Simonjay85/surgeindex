"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { TurnstileField, type TurnstileState } from "../turnstile-field";

const NOTE_MAX = 1000;

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string };

export function TipForm({ siteKey, page, compact = false, defaultTopic = "" }: { siteKey?: string; page?: string; compact?: boolean; defaultTopic?: string }) {
  const [topic, setTopic] = useState(defaultTopic);
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [token, setToken] = useState("");
  const [tsState, setTsState] = useState<TurnstileState>(siteKey ? "loading" : "ready");
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const onToken = useCallback((t: string) => setToken(t), []);

  const needsToken = Boolean(siteKey);
  const canSend = topic.trim().length >= 3 && sourceUrl.trim().length > 0 && (!needsToken || Boolean(token)) && status.kind !== "sending";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, sourceUrl: sourceUrl.trim(), note: note || undefined, email: email || undefined, page, turnstileToken: token || undefined, website: website || undefined }),
      });
      if (res.ok) {
        setStatus({ kind: "done" });
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setStatus({ kind: "error", message: data?.error?.message ?? "Chưa gửi được. Vui lòng thử lại." });
    } catch {
      setStatus({ kind: "error", message: "Mất kết nối. Vui lòng thử lại." });
    }
    setToken("");
    setNonce((n) => n + 1);
  }

  if (status.kind === "done") {
    return (
      <div className="t-tip-done" role="status">
        <CheckCircle2 size={22} aria-hidden="true" />
        <div>
          <strong>Cảm ơn bạn! Tin đã được gửi.</strong>
          <p>Đội ngũ SurgeIndex sẽ xem xét và kiểm tra nguồn trước khi dùng. Tin gửi đến không bao giờ được đăng tự động.</p>
          <button
            type="button"
            className="t-tip-again"
            onClick={() => {
              setTopic("");
              setSourceUrl("");
              setNote("");
              setEmail("");
              setToken("");
              setNonce((n) => n + 1);
              setStatus({ kind: "idle" });
            }}
          >
            Gửi thêm tin khác
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className={`t-tip-form ${compact ? "is-compact" : ""}`} onSubmit={submit} noValidate>
      <div className="t-tip-grid">
        <label className="t-field">
          <span>
            Chủ đề <em>*</em>
          </span>
          <input name="topic" required minLength={3} maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ví dụ: Diễn biến mới vụ …" autoComplete="off" />
        </label>
        <label className="t-field">
          <span>
            Link nguồn <em>*</em>
          </span>
          <input name="sourceUrl" type="url" inputMode="url" required maxLength={2048} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" autoComplete="off" />
        </label>
      </div>
      <label className="t-field">
        <span>
          Ghi chú <small>(không bắt buộc · {note.length}/{NOTE_MAX})</small>
        </span>
        <textarea name="note" rows={compact ? 3 : 4} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} placeholder="Bạn thấy gì, ở đâu, khi nào? Chỉ ghi những gì bạn biết chắc." />
      </label>
      <label className="t-field">
        <span>
          Email <small>(không bắt buộc — chỉ để chúng tôi hỏi thêm nếu cần)</small>
        </span>
        <input name="email" type="email" inputMode="email" maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@vidu.vn" autoComplete="email" />
      </label>
      <label className="t-tip-hp" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      <TurnstileField siteKey={siteKey} action="tip" onToken={onToken} onStateChange={setTsState} resetNonce={nonce} locale="vi" />
      {status.kind === "error" ? (
        <p className="t-tip-error" role="alert">
          {status.message}
        </p>
      ) : null}
      <div className="t-tip-foot">
        <button type="submit" className="t-tip-submit" disabled={!canSend} aria-disabled={!canSend}>
          <Send size={15} aria-hidden="true" />
          {status.kind === "sending" ? "Đang gửi…" : "Gửi tin"}
        </button>
        <p>
          Tin được kiểm duyệt thủ công, không tự động đăng.{needsToken && tsState !== "verified" ? " Cần hoàn tất bước xác minh trước khi gửi." : ""}
        </p>
      </div>
    </form>
  );
}
