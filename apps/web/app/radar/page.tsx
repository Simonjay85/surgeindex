import type { Metadata } from "next";
import { AppShell } from "../../components/app-shell";
import { RadarPageClient } from "../../components/radar-page-client";
import { getRadarSnapshot, normalizeRadarWindow } from "../../lib/server/radar-service";

export const metadata: Metadata = {
  title: "Radar",
  description: "Internet-wide context from Cloudflare Radar, kept separate from SurgeIndex rankings.",
  alternates: { canonical: "/radar" },
};

export default async function RadarPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const params = await searchParams;
  const initialWindow = normalizeRadarWindow(params.window);
  const initialSnapshot = await getRadarSnapshot({ window: initialWindow });
  return <AppShell><RadarPageClient initialSnapshot={initialSnapshot} initialWindow={initialWindow} /></AppShell>;
}
