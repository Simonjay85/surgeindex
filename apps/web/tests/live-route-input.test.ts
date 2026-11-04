import { describe, expect, it } from "vitest";
import { isValidSiteId } from "../lib/server/identifiers";

describe("live route site id validation", () => {
  it("accepts generated UUID site ids", () => {
    expect(isValidSiteId(crypto.randomUUID())).toBe(true);
  });

  it.each([
    "nonexistent-site",
    "00000000-0000-0000-0000-000000000000",
    "550e8400-e29b-11d4-a716-446655440000-extra",
    "' OR 1=1 --",
  ])("rejects invalid ids before a database lookup: %s", (siteId) => {
    expect(isValidSiteId(siteId)).toBe(false);
  });
});
