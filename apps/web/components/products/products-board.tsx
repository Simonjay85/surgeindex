import Link from "next/link";
import { ArrowUpRight, FlaskConical, Info, ShoppingBag, TrendingUp } from "lucide-react";
import { brandStyle } from "../trends/ui";
import { buyLinkLabel, formatViDate, isProductsBoardPublished, PRODUCTS_DISCLOSURE, SIGNAL_SOURCE_LABEL, type ProductItem, type ProductsBoard } from "../../lib/products";

const EXT = { target: "_blank", rel: "noopener noreferrer" } as const;
const BRAND = "#ff8a3d";

function ProductCard({ item }: { item: ProductItem }) {
  return (
    <li className="t-prod-card" id={`rank-${item.rank}`} style={{ "--i": item.rank } as React.CSSProperties}>
      <div className="t-prod-rank">
        <span className={`t-numeral ${item.rank === 1 ? "is-first" : ""}`}>{String(item.rank).padStart(2, "0")}</span>
      </div>
      <div className="t-prod-body">
        <span className="t-prod-cat">{item.category}</span>
        <h3 className="t-prod-name">{item.name}</h3>
        <p className="t-prod-note">{item.note}</p>
        <ul className="t-prod-signals" aria-label="Tín hiệu đo được">
          {item.signals.map((s) => (
            <li key={`${s.source}-${s.evidenceUrl}`}>
              <TrendingUp size={13} aria-hidden="true" />
              <span>
                {s.evidence}
                {" · "}
                <a href={s.evidenceUrl} {...EXT}>
                  Nguồn: {SIGNAL_SOURCE_LABEL[s.source]}, ghi nhận {formatViDate(s.observedAt)}
                  <ArrowUpRight size={11} aria-hidden="true" />
                </a>
              </span>
            </li>
          ))}
        </ul>
        {item.priceNote ? <p className="t-prod-price">{item.priceNote}</p> : null}
        <div className="t-prod-buy">
          {item.buyLinks.length ? (
            item.buyLinks.map((l) => (
              <a key={l.url} className="t-prod-btn" href={l.url} target="_blank" rel="sponsored nofollow noopener noreferrer">
                <ShoppingBag size={14} aria-hidden="true" /> {buyLinkLabel(l)}
              </a>
            ))
          ) : (
            <span className="t-prod-pending">Link mua đang cập nhật</span>
          )}
        </div>
      </div>
      {typeof item.signals[0]?.changePct === "number" ? (
        <div className="t-prod-stat" aria-label={`Tăng ${item.signals[0].changePct}% so với tuần trước`}>
          <strong>+{item.signals[0].changePct}%</strong>
          <span>tìm kiếm / tuần</span>
        </div>
      ) : null}
    </li>
  );
}

export function ProductsBoardView({ board }: { board: ProductsBoard }) {
  const published = isProductsBoardPublished(board);
  return (
    <div lang="vi">
      <section className="t-src-hero" style={brandStyle(BRAND)}>
        <div className="t-src-glow" aria-hidden="true" />
        <div className="t-wrap">
          <nav className="t-crumbs" aria-label="Breadcrumb">
            <Link href="/">SurgeIndex</Link>
            <span aria-hidden="true">/</span>
            <Link href="/top-10">Top 10</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Sản phẩm đang lên</span>
          </nav>
          <div className="t-src-head">
            <span className="t-src-icon">
              <TrendingUp size={34} aria-hidden="true" />
            </span>
            <div>
              <span className="t-kicker">Hàng tuần · Việt Nam</span>
              <h1 className="t-src-title">
                Sản phẩm <em>đang lên</em>
              </h1>
            </div>
          </div>
          <p className="t-lede is-narrow">Xếp theo tốc độ đang lên tại Việt Nam, không phải xếp theo chất lượng hay quảng cáo.</p>
          <div className="t-src-meta">
            <span className="t-status is-stale">
              <FlaskConical size={11} aria-hidden="true" /> Thử nghiệm
            </span>
            <span className="t-pill">Tuần {board.periodLabel}</span>
            <span className="t-pill">Cập nhật {formatViDate(board.updatedAt)}</span>
            {!published ? <span className="t-status is-soon">Bản nháp · chưa công khai</span> : null}
          </div>
        </div>
      </section>

      <div className="t-wrap t-src-layout">
        <div className="t-src-main">
          <p className="t-prod-disclosure" role="note">
            <Info size={15} aria-hidden="true" />
            <span>{PRODUCTS_DISCLOSURE}</span>
          </p>
          <ol className="t-prod-list" style={brandStyle(BRAND)}>
            {board.items.map((item) => (
              <ProductCard key={item.rank} item={item} />
            ))}
          </ol>
        </div>
        <aside className="t-src-side">
          <div className="t-side-card">
            <h2>Cách xếp hạng</h2>
            <p>{board.method}</p>
            <p>Mỗi sản phẩm cần ít nhất một tín hiệu đo được kèm link nguồn. Không ghi giá, lượt bán hay đánh giá nếu chưa kiểm tra. Board cập nhật mỗi tuần, không theo giờ như các board Top 10 khác.</p>
            {published ? (
              <Link href="/methodology#san-pham-dang-len" className="t-side-link">
                Phương pháp <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
