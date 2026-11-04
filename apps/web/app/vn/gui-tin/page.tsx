import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { TipForm } from "../../../components/tips/tip-form";
import { TrendShell } from "../../../components/trends/ui";

const TITLE = "Gửi tin nóng cho SurgeIndex | SurgeIndex VN";
const DESCRIPTION = "Bạn thấy một câu chuyện đang lan nhanh? Gửi chủ đề kèm link nguồn cho SurgeIndex. Mọi tin được kiểm tra thủ công, không tự động đăng.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/vn/gui-tin" },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: "/vn/gui-tin", locale: "vi_VN", siteName: "SurgeIndex", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
};

export default function TipPage() {
  return (
    <TrendShell>
      <div className="t-story" lang="vi">
        <section className="t-hero is-compact t-story-hero">
          <div className="t-wrap">
            <nav className="t-crumbs" aria-label="Breadcrumb">
              <Link href="/">SurgeIndex</Link>
              <span aria-hidden="true">/</span>
              <Link href="/vn/stories">Surge Story</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Gửi tin nóng</span>
            </nav>
            <span className="t-kicker t-story-kicker">Gửi tin nóng</span>
            <h1 className="t-display is-medium t-story-title">
              Bạn thấy gì <em>đang lan?</em>
            </h1>
            <p className="t-lede">Gửi chủ đề và link nguồn cho chúng tôi. SurgeIndex kiểm tra từng tin bằng nguồn báo chí trước khi đưa vào Surge Story hay bản cập nhật trực tiếp.</p>
          </div>
        </section>
        <div className="t-wrap t-story-body">
          <div className="t-tip-card">
            <TipForm siteKey={process.env.TURNSTILE_SITE_KEY || undefined} page="/vn/gui-tin" />
          </div>
          <ul className="t-tip-rules">
            <li>
              <ShieldCheck size={16} aria-hidden="true" /> Không tự động đăng: mọi tin đều được người thật đọc và kiểm chứng.
            </li>
            <li>
              <ShieldCheck size={16} aria-hidden="true" /> Chỉ gửi link công khai. Đừng gửi thông tin cá nhân của người khác.
            </li>
            <li>
              <ShieldCheck size={16} aria-hidden="true" /> Email (nếu có) chỉ dùng để hỏi thêm về tin bạn gửi, không dùng cho quảng cáo.
            </li>
          </ul>
        </div>
      </div>
    </TrendShell>
  );
}
