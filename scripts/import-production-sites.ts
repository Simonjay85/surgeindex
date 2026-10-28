import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { inArray } from "drizzle-orm";
import { closeDb, getPostgresDb, activityEvent, category, site, siteCategory, siteTag } from "@surge/db";
import { domainToSlug, normalizeDomain } from "@surge/shared";

type RawRow = Record<string, unknown>;
type ImportRow = {
  domain: string;
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  aliases: string[];
  tags: string[];
};

const allowedFields = new Set([
  "domain",
  "name",
  "description",
  "category",
  "categorySlug",
  "logoUrl",
  "faviconUrl",
  "ogImageUrl",
  "aliases",
  "tags",
]);
const forbiddenMetricFields = new Set([
  "visitors",
  "visitors24h",
  "sessions",
  "pageviews",
  "activeNow",
  "heatScore",
  "rank",
  "rankingState",
  "breakoutState",
  "growthPct",
  "revenue",
  "metrics",
  "score",
]);

function usage(): never {
  throw new Error("Usage: pnpm production:import -- --file <sites.csv|sites.json> [--apply]");
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() || null : null;
}

function parseCsv(input: string): RawRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  const headers = rows.shift()?.map((header) => header.replace(/^\ufeff/, "").trim()) ?? [];
  if (headers.length === 0 || headers.some((header) => !header)) throw new Error("CSV must contain a non-empty header row.");
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  return asString(value).split(/[|;]/).map((item) => item.trim()).filter(Boolean);
}

function safeAssetUrl(value: unknown, field: string): string | null {
  const raw = asString(value);
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${field} must be an absolute HTTPS URL.`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(`${field} must be an absolute HTTPS URL without credentials.`);
  return parsed.toString();
}

function normalizeRow(raw: RawRow, rowNumber: number): ImportRow {
  const unknownFields = Object.keys(raw).filter((key) => !allowedFields.has(key) && asString(raw[key]) !== "");
  const metricFields = unknownFields.filter((key) => forbiddenMetricFields.has(key));
  if (metricFields.length > 0) throw new Error(`Row ${rowNumber} contains production-metric fields (${metricFields.join(", ")}); import never accepts fabricated metrics.`);
  if (unknownFields.length > 0) throw new Error(`Row ${rowNumber} contains unsupported fields: ${unknownFields.join(", ")}.`);

  const rawDomain = asString(raw.domain);
  const domain = normalizeDomain(rawDomain);
  if (!domain) throw new Error(`Row ${rowNumber} has an invalid public domain.`);
  const categorySlug = (asString(raw.categorySlug) || asString(raw.category)).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug)) throw new Error(`Row ${rowNumber} must provide a category slug.`);
  const name = (asString(raw.name) || domain).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 160).trim();
  const description = asString(raw.description).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 320).trim();
  const aliases = asList(raw.aliases).map((value) => normalizeDomain(value)).filter((value): value is string => Boolean(value));
  if (aliases.length !== asList(raw.aliases).length) throw new Error(`Row ${rowNumber} contains an invalid alias; aliases must be public domains.`);
  const tags = [...new Set(asList(raw.tags).map((tag) => tag.toLowerCase().replace(/[^a-z0-9 _-]/g, "").trim()).filter(Boolean))].slice(0, 20);
  const slug = `${domainToSlug(domain)}-${createHash("sha256").update(domain).digest("hex").slice(0, 10)}`;
  return {
    domain,
    slug,
    name,
    description,
    categorySlug,
    logoUrl: safeAssetUrl(raw.logoUrl, "logoUrl"),
    faviconUrl: safeAssetUrl(raw.faviconUrl, "faviconUrl"),
    ogImageUrl: safeAssetUrl(raw.ogImageUrl, "ogImageUrl"),
    aliases: [...new Set(aliases.filter((alias) => alias !== domain))],
    tags,
  };
}

async function loadRows(filePath: string): Promise<ImportRow[]> {
  const input = await readFile(filePath, "utf8");
  const rawRows: RawRow[] = filePath.toLowerCase().endsWith(".csv")
    ? parseCsv(input)
    : (() => {
        const parsed = JSON.parse(input) as unknown;
        if (Array.isArray(parsed)) return parsed as RawRow[];
        if (parsed && typeof parsed === "object" && Array.isArray((parsed as { sites?: unknown }).sites)) return (parsed as { sites: RawRow[] }).sites;
        throw new Error("JSON must be an array of site objects or an object with a sites array.");
      })();
  if (rawRows.length === 0) throw new Error("The import file contains no rows.");
  const rows = rawRows.map((row, index) => normalizeRow(row, index + 2));
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.domain)) throw new Error(`The import file contains the domain ${row.domain} more than once.`);
    seen.add(row.domain);
  }
  return rows;
}

async function main(): Promise<void> {
  const filePath = argument("--file");
  if (!filePath || process.argv.includes("--help")) usage();
  const apply = process.argv.includes("--apply");
  if (apply && (process.env.APP_MODE !== "production" || process.env.DATA_PROVIDER !== "postgres" || process.env.PRODUCTION_IMPORT_ALLOW !== "YES")) {
    throw new Error("Apply requires APP_MODE=production, DATA_PROVIDER=postgres, and PRODUCTION_IMPORT_ALLOW=YES.");
  }
  const rows = await loadRows(filePath);
  const db = getPostgresDb();
  try {
    const categories = await db.select({ id: category.id, slug: category.slug }).from(category);
    const categoryIds = new Map(categories.map((item) => [item.slug, item.id]));
    const missingCategories = [...new Set(rows.map((row) => row.categorySlug).filter((slug) => !categoryIds.has(slug)))];
    if (missingCategories.length > 0) throw new Error(`Unknown category slugs: ${missingCategories.join(", ")}. Seed approved categories before importing.`);
    const domains = rows.map((row) => row.domain);
    const existing = await db.select({ domain: site.domain }).from(site).where(inArray(site.domain, domains));
    const existingDomains = new Set(existing.map((item) => item.domain));
    const candidates = rows.filter((row) => !existingDomains.has(row.domain));
    if (!apply) {
      console.log(JSON.stringify({ status: "dry_run", rows: rows.length, newPendingSites: candidates.length, existingSkipped: rows.length - candidates.length, metricsImported: false, nextStep: "Re-run with PRODUCTION_IMPORT_ALLOW=YES and --apply after review." }, null, 2));
      return;
    }
    let imported = 0;
    await db.transaction(async (tx) => {
      for (const row of candidates) {
        const [created] = await tx.insert(site).values({
          slug: row.slug,
          domain: row.domain,
          name: row.name,
          description: row.description,
          categoryId: categoryIds.get(row.categorySlug) ?? null,
          status: "pending",
          verification: "unverified",
          ownership: "unclaimed",
          logoUrl: row.logoUrl,
          faviconUrl: row.faviconUrl,
          ogImageUrl: row.ogImageUrl,
          submittedByUserId: null,
          isDemo: false,
          permittedAliases: row.aliases,
          publicRevenueVisible: false,
          publicPageMetricsVisible: false,
        }).onConflictDoNothing({ target: site.domain }).returning({ id: site.id });
        if (!created) continue;
        const categoryId = categoryIds.get(row.categorySlug);
        if (categoryId) await tx.insert(siteCategory).values({ siteId: created.id, categoryId }).onConflictDoNothing();
        if (row.tags.length > 0) await tx.insert(siteTag).values(row.tags.map((tag) => ({ siteId: created.id, tag }))).onConflictDoNothing();
        await tx.insert(activityEvent).values({ type: "site_submitted", siteId: created.id, detail: "Imported as pending production data; no metrics were supplied.", isDemo: false });
        imported += 1;
      }
    });
    console.log(JSON.stringify({ status: "applied", rows: rows.length, importedPendingSites: imported, existingSkipped: rows.length - imported, metricsImported: false }, null, 2));
  } finally {
    await closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Production site import failed.");
  process.exitCode = 1;
});
