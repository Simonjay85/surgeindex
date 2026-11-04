import { jsonOk } from "../../../../lib/server/http";

export const runtime = "nodejs";

/** Liveness is intentionally dependency-free: it only answers whether Node can serve requests. */
export async function GET(request: Request) {
  return jsonOk(request, {
    status: "ok",
    service: "surgeindex-web",
    build: process.env.BUILD_SHA ?? "unknown",
  });
}
