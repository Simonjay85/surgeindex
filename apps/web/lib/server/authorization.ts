import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./auth";
import { jsonError } from "./http";

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

export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/dashboard");
  return user;
}

export async function requirePageAdmin(): Promise<CurrentUser> {
  const user = await requirePageUser();
  if (user.role !== "admin") redirect("/auth/sign-in?error=admin_required");
  return user;
}
