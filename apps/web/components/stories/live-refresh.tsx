"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetch the server-rendered live blog every minute while the tab is visible. */
export function LiveRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
