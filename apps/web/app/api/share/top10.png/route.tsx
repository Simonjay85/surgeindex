import { ImageResponse } from "next/og";
import { ShareImage, loadShareFonts } from "../../../../lib/share/image";
import { getShareBoardEn, SHARE_SIZE, shareData } from "../../../../lib/share/top10";
import { getLatestSnapshot } from "../../../../lib/trends/read";

// Reads the latest snapshot and the self-hosted fonts from disk.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/share/top10.png[?board=google-trends|youtube|reddit|hackernews|github|wikipedia|amazon|ebay] → 1080×1350 PNG (English). */
export async function GET(request: Request) {
  const def = getShareBoardEn(new URL(request.url).searchParams.get("board"));
  if (!def) return new Response("Unknown board", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const [snapshot, fonts] = await Promise.all([getLatestSnapshot(), loadShareFonts()]);
  const data = shareData(snapshot, def);
  return new ImageResponse(<ShareImage data={data} />, {
    ...SHARE_SIZE,
    fonts,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Disposition": `inline; filename="surgeindex-top10-${def.id}.png"`,
      "X-Robots-Tag": "noindex",
    },
  });
}
