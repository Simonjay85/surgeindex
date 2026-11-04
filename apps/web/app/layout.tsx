import type { Metadata, Viewport } from "next";
import { getServerEnv } from "@surge/config";
import "./fonts.css";
import "./globals.css";
import "./trends.css";

const env = getServerEnv();

const TITLE = "SurgeIndex — The internet's Top 10, updated every hour";
const DESCRIPTION = "Hourly Top 10s from Google Trends, YouTube, Reddit, Hacker News and GitHub, ranked by Heat Score — how fast each item is surging right now.";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: TITLE, template: "%s · SurgeIndex" },
  description: DESCRIPTION,
  applicationName: "SurgeIndex",
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "SurgeIndex", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: TITLE }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/opengraph-image"] },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], shortcut: "/icon.svg" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#06070a", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
