import "server-only";

import { randomBytes } from "node:crypto";
import { domainToSlug, normalizeDomain } from "@surge/shared";
import { createPendingSite, findCategoryBySlug, findSiteByDomain, getPostgresDb } from "@surge/db";
import { fetchPublicMetadata, PublicFetchError } from "./ssrf";

export class SiteServiceError extends Error {
  constructor(public readonly code: "invalid_domain" | "duplicate_domain" | "category_not_found" | "metadata_unavailable" | "database_error", message: string) {
    super(message);
    this.name = "SiteServiceError";
  }
}

function cleanUserText(value: string | undefined, max: number): string {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function makeSlug(domain: string): string {
  return `${domainToSlug(domain)}-${randomBytes(3).toString("hex")}`;
}

export async function submitSiteForUser(input: {
  userId: string;
  url: string;
  categorySlug: string;
  title?: string;
  description?: string;
  requestId: string;
}) {
  const domain = normalizeDomain(input.url);
  if (!domain) throw new SiteServiceError("invalid_domain", "Enter a valid public HTTP or HTTPS domain.");
  const db = getPostgresDb();
  const existing = await findSiteByDomain(db, domain);
  if (existing) throw new SiteServiceError("duplicate_domain", "This canonical domain already has a listing.");
  const category = await findCategoryBySlug(db, input.categorySlug);
  if (!category) throw new SiteServiceError("category_not_found", "Choose a valid category.");
  let metadata;
  try {
    metadata = await fetchPublicMetadata(`https://${domain}`);
  } catch (error) {
    if (error instanceof PublicFetchError) throw new SiteServiceError("metadata_unavailable", "We could not safely import public metadata from that site yet.");
    throw new SiteServiceError("metadata_unavailable", "We could not import public metadata from that site yet.");
  }
  const name = cleanUserText(input.title, 160) || cleanUserText(metadata.title, 160) || domain;
  const description = cleanUserText(input.description, 320) || cleanUserText(metadata.description, 320);
  const created = await createPendingSite(db, {
    domain,
    slug: makeSlug(domain),
    name,
    description,
    categoryId: category.id,
    submittedByUserId: input.userId,
    requestId: input.requestId,
  });
  if (created.duplicate) throw new SiteServiceError("duplicate_domain", "This canonical domain already has a listing.");
  return { ...created, domain, name, description, categorySlug: category.slug, isDemo: false, status: "pending" as const };
}
