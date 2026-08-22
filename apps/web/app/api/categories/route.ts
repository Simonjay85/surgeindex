import { NextResponse } from "next/server";
import { getPublicDataProvider } from "../../../lib/server/public-provider";

export async function GET() {
  const provider = getPublicDataProvider();
  return NextResponse.json({ data: await provider.getCategories(), source: provider.source }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
}
