import "server-only";

import { resolveTxt } from "node:dns/promises";
import { randomBytes } from "node:crypto";
import { createClaim, completeClaim, getClaimForUser, getPostgresDb, recordClaimAttempt } from "@surge/db";
import { fetchPublicMetadata, extractMetaVerificationToken } from "./ssrf";

export class ClaimServiceError extends Error {
  constructor(public readonly code: "site_not_found" | "ownership_conflict" | "claim_not_found" | "claim_expired" | "claim_not_pending" | "verification_failed" | "attempt_limit", message: string) {
    super(message);
    this.name = "ClaimServiceError";
  }
}

const CLAIM_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function startOwnershipClaim(input: { siteId: string; userId: string; method: "meta_tag" | "dns_txt" }) {
  const result = await createClaim(getPostgresDb(), {
    siteId: input.siteId,
    userId: input.userId,
    method: input.method,
    token: randomBytes(32).toString("hex"),
    expiresAt: new Date(Date.now() + CLAIM_TTL_MS),
  });
  if (!result.ok && result.reason === "site_not_found") throw new ClaimServiceError("site_not_found", "Site was not found.");
  if (!result.ok && result.reason === "ownership_conflict") throw new ClaimServiceError("ownership_conflict", "This site already has another verified owner and needs admin review.");
  if (!result.claim) throw new ClaimServiceError("claim_not_found", "Could not create a verification challenge.");
  return { claimId: result.claim.id, method: input.method, token: result.claim.token, expiresAt: result.claim.expiresAt };
}

export async function verifyOwnershipClaim(input: { claimId: string; userId: string }) {
  const db = getPostgresDb();
  const claim = await getClaimForUser(db, input.claimId, input.userId);
  if (!claim) throw new ClaimServiceError("claim_not_found", "Verification challenge was not found.");
  if (claim.status !== "pending") throw new ClaimServiceError("claim_not_pending", "This verification challenge is no longer pending.");
  if (claim.expiresAt.getTime() <= Date.now()) {
    await recordClaimAttempt(db, claim.id, "expired", "challenge_expired");
    throw new ClaimServiceError("claim_expired", "This verification challenge has expired.");
  }
  if (claim.attempts >= MAX_ATTEMPTS) {
    // Close any legacy/racing pending row that already reached the cap. The
    // repository clamps the counter so this cannot inflate attempts past the
    // configured limit.
    await recordClaimAttempt(db, claim.id, "pending", "attempt_limit", MAX_ATTEMPTS);
    throw new ClaimServiceError("attempt_limit", "This verification challenge has reached its attempt limit.");
  }
  let verified = false;
  if (claim.method === "dns_txt") {
    try {
      const records = await resolveTxt(claim.domain);
      verified = records.flat().some((record) => record.trim() === `surgeindex-verification=${claim.token}`);
    } catch {
      verified = false;
    }
  } else if (claim.method === "meta_tag") {
    try {
      const document = await fetchPublicMetadata(`https://${claim.domain}`);
      verified = extractMetaVerificationToken(document.html) === claim.token;
    } catch {
      verified = false;
    }
  }
  if (!verified) {
    const attempt = await recordClaimAttempt(db, claim.id, "pending", "verification_proof_not_found", MAX_ATTEMPTS);
    if (attempt?.status === "failed") {
      throw new ClaimServiceError("attempt_limit", "This verification challenge has reached its attempt limit.");
    }
    throw new ClaimServiceError("verification_failed", "The verification proof was not found yet. Check the site and try again.");
  }
  const result = await completeClaim(db, claim.id, input.userId);
  if (!result.ok && result.reason === "ownership_conflict") throw new ClaimServiceError("ownership_conflict", "Another verified owner was found. An admin must review this conflict.");
  if (!result.ok && result.reason === "expired") throw new ClaimServiceError("claim_expired", "This verification challenge has expired.");
  if (!result.ok && result.reason === "not_pending") throw new ClaimServiceError("claim_not_pending", "This verification challenge is no longer pending.");
  if (!result.ok) throw new ClaimServiceError("claim_not_found", "Verification challenge was not found.");
  return result;
}
