import type { Metadata } from "next";
import { ProductsBoardView } from "../../../components/products/products-board";
import { TrendShell } from "../../../components/trends/ui";
import { isProductsBoardPublished, PRODUCTS_BOARD, PRODUCTS_BOARD_PATH } from "../../../lib/products";

const TITLE = "Sản phẩm đang lên tại Việt Nam (thử nghiệm) | SurgeIndex VN";
const DESCRIPTION = "Sản phẩm được tìm kiếm tăng nhanh nhất tại Việt Nam trong tuần, xếp theo tốc độ đang lên, kèm tín hiệu đo được và link nguồn.";

export function generateMetadata(): Metadata {
  const published = isProductsBoardPublished(PRODUCTS_BOARD);
  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: { canonical: PRODUCTS_BOARD_PATH },
    openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: PRODUCTS_BOARD_PATH, locale: "vi_VN", siteName: "SurgeIndex", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
    // Draft boards are reachable for preview only: never indexed.
    robots: published ? undefined : { index: false, follow: false },
  };
}

// Weekly, file-based data: rebuilt on deploy; hourly revalidation is plenty.
export const revalidate = 3600;

export default function ProductsBoardPage() {
  return (
    <TrendShell>
      <ProductsBoardView board={PRODUCTS_BOARD} />
    </TrendShell>
  );
}
