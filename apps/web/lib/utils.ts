import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { normalizeDomain } from "@surge/shared";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function safeDomain(value: string): string | null {
  return normalizeDomain(value);
}
