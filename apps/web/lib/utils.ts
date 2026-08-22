import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function safeDomain(value: string): string | null {
  const candidate = value.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split("/")[0] ?? "";
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(candidate) ? candidate : null;
}
