import { NextResponse } from "next/server";
import { z } from "zod";
import { getSite } from "../../../lib/demo-data";
import { safeDomain } from "../../../lib/utils";

const submitSchema = z.object({ url: z.string().min(1), category: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid website URL and category." }, { status: 422 });
  const domain = safeDomain(parsed.data.url);
  if (!domain) return NextResponse.json({ error: "Only public domains are accepted." }, { status: 422 });
  const existing = getSite(domain.replace(/\./g, "-"));
  return NextResponse.json({ data: { domain, category: parsed.data.category, duplicate: Boolean(existing), status: "pending_review", isDemo: true }, source: "demo" }, { status: 201 });
}
