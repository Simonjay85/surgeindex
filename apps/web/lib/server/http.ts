import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getServerEnv } from "@surge/config";

export function requestId(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && /^[A-Za-z0-9._-]{8,100}$/.test(supplied) ? supplied : randomUUID();
}

export function jsonError(request: Request, status: number, code: string, message: string) {
  const id = requestId(request);
  return NextResponse.json({ error: { code, message, requestId: id } }, { status, headers: { "x-request-id": id, "Cache-Control": "no-store" } });
}

export function jsonOk<T>(request: Request, data: T, status = 200, headers?: HeadersInit) {
  const id = requestId(request);
  return NextResponse.json({ data, requestId: id }, { status, headers: { "x-request-id": id, ...headers } });
}

/** Origin checking complements Better Auth's trusted origin checks for mutations. */
export function assertSameOrigin(request: Request): { ok: true } | { ok: false; response: NextResponse } {
  const origin = request.headers.get("origin");
  if (!origin) return { ok: true };
  const configured = new URL(getServerEnv().NEXT_PUBLIC_APP_URL).origin;
  if (origin !== configured) return { ok: false, response: jsonError(request, 403, "csrf_origin", "Request origin is not allowed.") };
  return { ok: true };
}
