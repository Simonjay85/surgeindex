import { NextResponse } from "next/server";
import { getPublicDataProvider } from "../../../lib/server/public-provider";

export async function GET() {
  const provider = getPublicDataProvider();
  return NextResponse.json({ data: await provider.getActivity(), source: provider.source }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
}
