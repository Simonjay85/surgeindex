import { NextResponse } from "next/server";
import { getActivity } from "../../../lib/demo-data";

export function GET() {
  return NextResponse.json({ data: getActivity(), source: "demo" }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
}
