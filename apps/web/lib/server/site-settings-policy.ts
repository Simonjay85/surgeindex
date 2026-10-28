import "server-only";

export type SiteSettingsRole = "owner" | "editor" | "admin" | "none";

export interface SiteSettingsChanges {
  aliasesChanged: boolean;
  privacyChanged: boolean;
}

/**
 * Keep the owner/editor boundary independent from request parsing and SQL.
 * Editors may maintain presentation metadata, while tracker allowlists and
 * public disclosure controls remain owner-only. Admins retain the existing
 * server-side override; an absent membership is never authorized.
 */
export function authorizeSiteSettingsChange(role: SiteSettingsRole, changes: SiteSettingsChanges): "allowed" | "owner_required" | "not_authorized" {
  if (role === "none") return "not_authorized";
  if (role === "editor" && (changes.aliasesChanged || changes.privacyChanged)) return "owner_required";
  return "allowed";
}
