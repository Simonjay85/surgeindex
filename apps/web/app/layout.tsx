import type { Metadata } from "next";
import { getServerEnv } from "@surge/config";
import "./globals.css";

const env = getServerEnv();

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: "SurgeIndex — the live leaderboard of internet attention", template: "%s · SurgeIndex" },
  description: "Watch websites go viral in real time through verified traffic, live activity, and transparent attention metrics.",
  openGraph: { title: "SurgeIndex — the live leaderboard of internet attention", description: "Earn the rank. Buy the reach.", type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SurgeIndex — the live leaderboard of internet attention" }] },
  twitter: { card: "summary_large_image", title: "SurgeIndex — the live leaderboard of internet attention", description: "Watch websites go viral in real time.", images: ["/opengraph-image"] },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], shortcut: "/icon.svg" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
