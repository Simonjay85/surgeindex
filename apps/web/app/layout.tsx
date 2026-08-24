import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "SurgeIndex — the live leaderboard of internet attention", template: "%s · SurgeIndex" },
  description: "Watch websites go viral in real time through verified traffic, live activity, and transparent attention metrics.",
  openGraph: { title: "SurgeIndex — the live leaderboard of internet attention", description: "Earn the rank. Buy the reach.", type: "website" },
  twitter: { card: "summary_large_image", title: "SurgeIndex — the live leaderboard of internet attention", description: "Watch websites go viral in real time." },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], shortcut: "/icon.svg" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
