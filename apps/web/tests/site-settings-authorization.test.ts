import { describe, expect, it } from "vitest";
import { authorizeSiteSettingsChange } from "../lib/server/site-settings-policy";

const presentationOnly = { aliasesChanged: false, privacyChanged: false };

describe("owner/editor site settings authorization", () => {
  it("allows editors to update presentation metadata", () => {
    expect(authorizeSiteSettingsChange("editor", presentationOnly)).toBe("allowed");
  });

  it.each([
    ["permitted tracker aliases", { aliasesChanged: true, privacyChanged: false }],
    ["public disclosure settings", { aliasesChanged: false, privacyChanged: true }],
    ["both restricted groups", { aliasesChanged: true, privacyChanged: true }],
  ])("requires the verified owner for %s", (_label, changes) => {
    expect(authorizeSiteSettingsChange("editor", changes)).toBe("owner_required");
  });

  it("allows the verified owner to change aliases and disclosure settings", () => {
    expect(authorizeSiteSettingsChange("owner", { aliasesChanged: true, privacyChanged: true })).toBe("allowed");
  });

  it("keeps the existing admin override and rejects missing membership", () => {
    expect(authorizeSiteSettingsChange("admin", { aliasesChanged: true, privacyChanged: true })).toBe("allowed");
    expect(authorizeSiteSettingsChange("none", presentationOnly)).toBe("not_authorized");
  });
});
