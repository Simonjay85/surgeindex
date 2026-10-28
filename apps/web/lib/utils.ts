import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { normalizeDomain } from "@surge/shared";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function safeDomain(value: string): string | null {
  return normalizeDomain(value);
}

/**
 * Return a path that can safely be used as an internal post-auth destination.
 *
 * Redirect parameters are attacker-controlled even when they arrive from a
 * same-origin page. Decode a bounded number of times before validating so an
 * encoded `//host` or backslash-prefixed URL cannot bypass the check.
 */
export function safeInternalPath(value: unknown, fallback = "/dashboard"): string {
  if (!isSafeInternalPath(value)) return fallback;
  return value as string;
}

export function isSafeInternalPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) return false;
  const original = value.trim();
  if (original !== value) return false;
  let decoded = original;
  // Three rounds catches the usual query-string encoding, but accepting a
  // small bounded amount of additional encoding makes the guard resilient to
  // redirect values that have passed through several serializers without
  // creating an attacker-controlled unbounded decode loop.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return false;
    }
    if (next === decoded) break;
    decoded = next;
  }
  if (!original.startsWith("/") || original.startsWith("//") || !decoded.startsWith("/") || decoded.startsWith("//")) return false;
  if (original.includes("\\") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(original) || /[\u0000-\u001f\u007f]/.test(decoded)) return false;
  try {
    const parsed = new URL(original, "https://surgeindex.invalid");
    return parsed.origin === "https://surgeindex.invalid" && parsed.pathname.startsWith("/");
  } catch {
    return false;
  }
}
