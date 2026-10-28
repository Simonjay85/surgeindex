import { TrendShell } from "./ui";

export function ProsePage({ kicker, title, lede, children }: { kicker: string; title: React.ReactNode; lede: string; children: React.ReactNode }) {
  return (
    <TrendShell>
      <section className="t-hero is-compact">
        <div className="t-wrap">
          <span className="t-kicker">{kicker}</span>
          <h1 className="t-display is-medium">{title}</h1>
          <p className="t-lede">{lede}</p>
        </div>
      </section>
      <div className="t-wrap">
        <div className="t-prose">{children}</div>
      </div>
    </TrendShell>
  );
}
