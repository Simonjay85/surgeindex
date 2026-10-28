import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["pg", "pg-cloudflare"],
  distDir: process.env.SURGEINDEX_NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
