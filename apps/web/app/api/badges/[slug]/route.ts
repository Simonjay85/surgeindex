import { getSite } from "../../../../lib/demo-data";

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" })[character] ?? character);
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = getSite(slug);
  if (!site) return new Response("not found", { status: 404 });
  const title = escapeXml(`#${site.rank || 1} Trending in ${site.categoryName}`);
  const label = escapeXml("SurgeIndex");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="310" height="48" viewBox="0 0 310 48" role="img" aria-label="${title} on SurgeIndex"><rect width="310" height="48" rx="12" fill="#fffdfb" stroke="#e8ddd6"/><circle cx="22" cy="24" r="6" fill="#ef7359"/><text x="38" y="22" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#25211e">${title}</text><text x="38" y="36" font-family="Arial,sans-serif" font-size="10" fill="#847b75">${label} · demo data</text></svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
