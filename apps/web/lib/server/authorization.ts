import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./auth";
import { jsonError } from "./http";
import { safeInternalPath } from "../utils";

export async function requireApiUser(request: Request): Promise<{ user: CurrentUser } | { response: Response }> {
  const user = await getCurrentUser(request);
  return user ? { user } : { response: jsonError(request, 401, "authentication_required", "Sign in is required.") };
}

export async function requireApiAdmin(request: Request): Promise<{ user: CurrentUser } | { response: Response }> {
  const result = await requireApiUser(request);
  if ("response" in result) return result;
  return result.user.role === "admin"
    ? result
    : { response: jsonError(request, 403, "admin_required", "Administrator access is required.") };
}

export async function requirePageUser(nextPath = "/dashboard", authMode: "sign-in" | "sign-up" = "sign-in"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  const safeNext = encodeURIComponent(safeInternalPath(nextPath));
  if (!user) redirect(authMode === "sign-up"
    ? `/auth/sign-in?mode=sign-up&next=${safeNext}`
    : `/auth/sign-in?next=${safeNext}`);
  return user;
}

export async function requireVerifiedApiUser(request: Request): Promise<{ user: CurrentUser } | { response: Response }> {
  const result = await requireApiUser(request);
  if ("response" in result) return result;
  return result.user.emailVerified
    ? result
    : { response: jsonError(request, 403, "email_verification_required", "Verify your email before continuing.") };
}

export async function requirePageAdmin(): Promise<CurrentUser> {
  const user = await requirePageUser();
  if (user.role !== "admin") redirect("/auth/sign-in?error=admin_required");
  return user;
}
