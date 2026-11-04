import { z } from "zod";
import raw from "../../data/products-vn.json";

/**
 * "Sản phẩm đang lên" — weekly, hand-curated product board (thử nghiệm).
 * Data lives in apps/web/data/products-vn.json; see PRODUCTS_BOARD.md for the
 * weekly workflow. Nothing here touches the hourly trends ingest.
 */
export const PRODUCTS_BOARD_PATH = "/top-10/san-pham-dang-len";

const httpsUrl = z.string().url().refine((u) => u.startsWith("https://"), "must be https");
const isoWithZone = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?[+-]\d{2}:\d{2}$/, "ISO date-time with offset, e.g. 2026-10-27T16:40:00+07:00");

export const productSignalSchema = z.object({
  source: z.enum(["google-trends-vn", "tiktok-top-products-vn"]),
  evidence: z.string().min(10),
  changePct: z.number().nullable().optional(),
  window: z.object({ current: z.string(), previous: z.string() }).optional(),
  evidenceUrl: httpsUrl,
  observedAt: isoWithZone,
});

export const buyLinkSchema = z.object({
  retailer: z.enum(["Shopee", "TikTok Shop"]),
  url: httpsUrl,
  disclosure: z.literal(true),
});

export const productItemSchema = z.object({
  rank: z.number().int().positive(),
  name: z.string().min(2),
  category: z.string().min(2),
  keyword: z.string().optional(),
  signals: z.array(productSignalSchema).min(1, "every item needs at least one measured signal"),
  buyLinks: z.array(buyLinkSchema),
  priceNote: z.string().nullable(),
  note: z.string().min(10),
});

export const productsBoardSchema = z
  .object({
    status: z.enum(["draft", "published"]),
    week: z.string().regex(/^\d{4}-W\d{2}$/),
    periodLabel: z.string(),
    updatedAt: isoWithZone,
    method: z.string(),
    items: z.array(productItemSchema).min(1).max(10),
  })
  .superRefine((b, ctx) => {
    b.items.forEach((it, i) => {
      if (it.rank !== i + 1) ctx.addIssue({ code: "custom", path: ["items", i, "rank"], message: "items must be listed in rank order 1..n" });
    });
  });

export type ProductsBoard = z.infer<typeof productsBoardSchema>;
export type ProductItem = z.infer<typeof productItemSchema>;
export type BuyLink = z.infer<typeof buyLinkSchema>;

export function parseProductsBoard(input: unknown): ProductsBoard {
  const parsed = productsBoardSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid products-vn.json: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
  return parsed.data;
}

export const PRODUCTS_BOARD: ProductsBoard = parseProductsBoard(raw);

/** Published = linked from /top-10, in the sitemap and methodology, indexable. */
export function isProductsBoardPublished(board: ProductsBoard = PRODUCTS_BOARD): boolean {
  return board.status === "published";
}

export const SIGNAL_SOURCE_LABEL: Record<ProductItem["signals"][number]["source"], string> = {
  "google-trends-vn": "Google Trends VN",
  "tiktok-top-products-vn": "TikTok Top Products VN",
};

export function buyLinkLabel(link: BuyLink): string {
  return `Mua trên ${link.retailer} · Link affiliate`;
}

export function formatViDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export const PRODUCTS_DISCLOSURE =
  "Một số link mua là link affiliate. Bạn bấm mua qua link đó, SurgeIndex có thể nhận hoa hồng, giá bạn trả không đổi. Thứ hạng không bị ảnh hưởng bởi hoa hồng.";
