import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProductsBoardView } from "../components/products/products-board";
import { buyLinkLabel, isProductsBoardPublished, parseProductsBoard, PRODUCTS_BOARD, PRODUCTS_BOARD_PATH, type ProductsBoard } from "../lib/products";
import { generateMetadata } from "../app/top-10/san-pham-dang-len/page";
import { SOURCE_KEYS } from "../lib/trends/types";
import raw from "../data/products-vn.json";

const clone = (): ProductsBoard => JSON.parse(JSON.stringify(PRODUCTS_BOARD)) as ProductsBoard;

describe("Sản phẩm đang lên data", () => {
  afterEach(() => cleanup());

  it("parses the bundled week and keeps it a draft until real affiliate data is approved", () => {
    expect(parseProductsBoard(raw).items.length).toBe(10);
    expect(PRODUCTS_BOARD.status).toBe("draft");
    expect(isProductsBoardPublished()).toBe(false);
    expect(PRODUCTS_BOARD_PATH).toBe("/top-10/san-pham-dang-len");
    expect((SOURCE_KEYS as readonly string[]).includes("san-pham-dang-len")).toBe(false);
  });

  it("gives every item a measured signal with an https source and a +07:00 timestamp, ranked by growth", () => {
    let prev = Infinity;
    for (const item of PRODUCTS_BOARD.items) {
      expect(item.signals.length).toBeGreaterThanOrEqual(1);
      for (const s of item.signals) {
        expect(s.evidenceUrl.startsWith("https://trends.google.com/trends/explore?") || s.evidenceUrl.startsWith("https://ads.tiktok.com/")).toBe(true);
        expect(s.observedAt.endsWith("+07:00")).toBe(true);
      }
      const pct = item.signals[0]!.changePct ?? 0;
      expect(pct).toBeLessThanOrEqual(prev);
      prev = pct;
      // No invented prices; links are only AccessTrade TikTok Shop deep links (disclosed).
      expect(item.priceNote).toBeNull();
      for (const link of item.buyLinks) {
        expect(link.disclosure).toBe(true);
        if (link.retailer === "TikTok Shop") expect(link.url).toMatch(/^https:\/\/go\.isclix\.com\/deep_link\/\d+\/6648523843406889655\?url=https%3A%2F%2Fshop\.tiktok\.com%2Fview%2Fproduct%2F\d+/);
      }
    }
  });

  it("rejects items without signals, non-affiliate-disclosed links and out-of-order ranks", () => {
    const noSignal = clone();
    noSignal.items[0]!.signals = [];
    expect(() => parseProductsBoard(noSignal)).toThrow(/measured signal/);
    const badLink = clone() as unknown as { items: Array<{ buyLinks: unknown[] }> };
    badLink.items[0]!.buyLinks = [{ retailer: "Shopee", url: "https://s.shopee.vn/x", disclosure: false }];
    expect(() => parseProductsBoard(badLink)).toThrow();
    const order = clone();
    order.items[0]!.rank = 2;
    expect(() => parseProductsBoard(order)).toThrow(/rank order/);
  });
});

describe("Sản phẩm đang lên page", () => {
  afterEach(() => cleanup());

  it("is noindex while the board is a draft", () => {
    expect(generateMetadata().robots).toEqual({ index: false, follow: false });
  });

  it("shows the Thử nghiệm badge, the disclosure above the list and a pending buy state", () => {
    render(<ProductsBoardView board={PRODUCTS_BOARD} />);
    expect(screen.getByText("Thử nghiệm")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("link affiliate");
    const withoutLinks = PRODUCTS_BOARD.items.filter((i) => !i.buyLinks.length).length;
    const linkCount = PRODUCTS_BOARD.items.reduce((n, i) => n + i.buyLinks.length, 0);
    expect(screen.queryAllByText("Link mua đang cập nhật")).toHaveLength(withoutLinks);
    expect(screen.queryAllByRole("link", { name: /Mua trên .* · Link affiliate/ })).toHaveLength(linkCount);
    const first = screen.getAllByRole("listitem").find((li) => li.id === "rank-1")!;
    expect(within(first).getByRole("link", { name: /Google Trends VN/ })).toHaveAttribute("href", PRODUCTS_BOARD.items[0]!.signals[0]!.evidenceUrl);
  });

  it("renders affiliate buttons with retailer labels and sponsored rel once links exist", () => {
    const board = clone();
    board.status = "published";
    for (const item of board.items) item.buyLinks = [];
    board.items[0]!.buyLinks = [
      { retailer: "Shopee", url: "https://s.shopee.vn/example", disclosure: true },
      { retailer: "TikTok Shop", url: "https://vt.tiktok.com/example", disclosure: true },
    ];
    render(<ProductsBoardView board={board} />);
    const shopee = screen.getByRole("link", { name: "Mua trên Shopee · Link affiliate" });
    expect(shopee).toHaveAttribute("rel", expect.stringContaining("sponsored"));
    expect(screen.getByRole("link", { name: "Mua trên TikTok Shop · Link affiliate" })).toBeInTheDocument();
    expect(screen.getAllByText("Link mua đang cập nhật")).toHaveLength(9);
    expect(screen.queryByText(/Bản nháp/)).toBeNull();
    expect(buyLinkLabel({ retailer: "Shopee", url: "https://x.y", disclosure: true })).toBe("Mua trên Shopee · Link affiliate");
  });
});
