import { canonicalOutlet, normalizeVi, type NewsArticle } from "../trends/news";
import type { PressFile, PressItem } from "./types";

/** "Báo chí đang nói gì": RSS articles whose headline mentions a live story's keywords. */

export const PRESS_MAX_ITEMS = 40;
/** Matches older than this drop off the feed. */
export const PRESS_RETENTION_DAYS = 14;

/** Whole-phrase match on diacritic-free text, so "Trường Giang" also matches "TRƯỜNG GIANG" or "Truong Giang". */
export function matchKeyword(title: string, keywords: string[]): string | null {
  const hay = ` ${normalizeVi(title)} `;
  for (const k of keywords) {
    const needle = normalizeVi(k);
    if (needle.length >= 3 && hay.includes(` ${needle} `)) return k;
  }
  return null;
}

export function buildPressFile(slug: string, keywords: string[], articles: NewsArticle[], previous: PressFile | null, now: number): PressFile {
  const nowIso = new Date(now).toISOString();
  const byUrl = new Map<string, PressItem>();
  for (const p of previous?.items ?? []) byUrl.set(p.url, p);
  for (const a of articles) {
    const matched = matchKeyword(a.title, keywords);
    if (!matched) continue;
    const prev = byUrl.get(a.url);
    byUrl.set(a.url, { title: a.title, url: a.url, outlet: canonicalOutlet(a.outlet), publishedAt: a.publishedAt, matched, firstSeen: prev?.firstSeen ?? nowIso });
  }
  // One entry per (outlet, headline): Google News and the outlet's own feed can both carry it.
  const seen = new Set<string>();
  const cutoff = now - PRESS_RETENTION_DAYS * 86_400_000;
  const items = [...byUrl.values()]
    .sort((a, b) => Number(b.url.includes("news.google.com") ? 0 : 1) - Number(a.url.includes("news.google.com") ? 0 : 1))
    .filter((i) => {
      const key = `${normalizeVi(i.outlet)}|${normalizeVi(i.title)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return Date.parse(i.publishedAt ?? i.firstSeen) >= cutoff;
    })
    .sort((a, b) => (b.publishedAt ?? b.firstSeen).localeCompare(a.publishedAt ?? a.firstSeen))
    .slice(0, PRESS_MAX_ITEMS);
  return { slug, generatedAt: nowIso, items };
}
