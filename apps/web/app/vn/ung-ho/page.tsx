/* eslint-disable @next/next/no-img-element -- the VietQR image is served by img.vietqr.io; the VPS never runs the image optimizer */
import type { Metadata } from "next";
import Link from "next/link";
import { Coffee, HeartHandshake, Landmark, Smartphone } from "lucide-react";
import { TrendShell } from "../../../components/trends/ui";
import { DONATE_NOTE, getDonateConfig } from "../../../lib/donate";

const TITLE = "Ủng hộ SurgeIndex | SurgeIndex VN";
const DESCRIPTION = "SurgeIndex miễn phí cho mọi người. Nếu bạn thấy hữu ích, có thể ủng hộ để chúng tôi tiếp tục theo dõi và kiểm chứng các câu chuyện mạng xã hội Việt Nam.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/vn/ung-ho" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/vn/ung-ho", locale: "vi_VN", siteName: "SurgeIndex", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
};

// Donation channels come only from env vars; re-read hourly.
export const revalidate = 3600;

export default function DonatePage() {
  const cfg = getDonateConfig();
  return (
    <TrendShell>
      <div className="t-story" lang="vi">
        <section className="t-hero is-compact t-story-hero">
          <div className="t-wrap">
            <nav className="t-crumbs" aria-label="Breadcrumb">
              <Link href="/">SurgeIndex</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Ủng hộ</span>
            </nav>
            <span className="t-kicker t-story-kicker">Ủng hộ SurgeIndex</span>
            <h1 className="t-display is-medium t-story-title">
              Giữ SurgeIndex <em>miễn phí.</em>
            </h1>
            <p className="t-lede">SurgeIndex miễn phí cho mọi người. Mỗi khoản ủng hộ giúp trả tiền máy chủ, API và thời gian kiểm chứng nguồn cho từng câu chuyện.</p>
          </div>
        </section>
        <div className="t-wrap t-story-body">
          {cfg.enabled ? (
            <div className="t-donate">
              {cfg.bank ? (
                <section className="t-donate-card is-bank" aria-labelledby="chuyen-khoan">
                  <div className="t-donate-qr">
                    <img src={cfg.bank.qrUrl} alt={`Mã VietQR chuyển khoản tới ${cfg.bank.accountName}, nội dung ${DONATE_NOTE}`} width={300} height={300} loading="eager" decoding="async" referrerPolicy="no-referrer" />
                  </div>
                  <div className="t-donate-body">
                    <span className="t-donate-icon">
                      <Landmark size={18} aria-hidden="true" />
                    </span>
                    <h2 id="chuyen-khoan">Chuyển khoản ngân hàng (VietQR)</h2>
                    <p>Mở app ngân hàng bất kỳ, chọn quét mã QR. Số tiền tùy bạn.</p>
                    <dl>
                      {cfg.bank.bankName ? (
                        <div>
                          <dt>Ngân hàng</dt>
                          <dd>{cfg.bank.bankName}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>Số tài khoản</dt>
                        <dd className="is-mono">{cfg.bank.accountNo}</dd>
                      </div>
                      <div>
                        <dt>Chủ tài khoản</dt>
                        <dd>{cfg.bank.accountName}</dd>
                      </div>
                      <div>
                        <dt>Nội dung</dt>
                        <dd className="is-mono">{DONATE_NOTE}</dd>
                      </div>
                    </dl>
                  </div>
                </section>
              ) : null}
              {cfg.momoPhone ? (
                <section className="t-donate-card" aria-labelledby="momo">
                  <span className="t-donate-icon is-momo">
                    <Smartphone size={18} aria-hidden="true" />
                  </span>
                  <h2 id="momo">Ví MoMo</h2>
                  <p>Chuyển tới số điện thoại bên dưới, ghi nội dung “{DONATE_NOTE}”.</p>
                  <p className="t-donate-big is-mono">{cfg.momoPhone}</p>
                </section>
              ) : null}
              {cfg.intlUrl ? (
                <section className="t-donate-card" aria-labelledby="quoc-te">
                  <span className="t-donate-icon is-intl">
                    <Coffee size={18} aria-hidden="true" />
                  </span>
                  <h2 id="quoc-te">Ủng hộ từ nước ngoài</h2>
                  <p>Thẻ quốc tế / PayPal qua trang ủng hộ của chúng tôi.</p>
                  <a className="t-button" href={cfg.intlUrl} target="_blank" rel="noopener noreferrer">
                    Mở trang ủng hộ
                  </a>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="t-donate-soon">
              <HeartHandshake size={26} aria-hidden="true" />
              <strong>Sắp ra mắt</strong>
              <p>Kênh ủng hộ đang được chuẩn bị. Trong lúc chờ, cách ủng hộ tốt nhất là chia sẻ SurgeIndex và <Link href="/vn/gui-tin">gửi tin nóng</Link> kèm nguồn cho chúng tôi.</p>
            </div>
          )}
          <p className="t-story-disclaimer">Ủng hộ là tự nguyện, không đổi lấy quyền lợi biên tập: người ủng hộ không quyết định nội dung, thứ hạng hay câu chuyện nào được đăng.</p>
        </div>
      </div>
    </TrendShell>
  );
}
