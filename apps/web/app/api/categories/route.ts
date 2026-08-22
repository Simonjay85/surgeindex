import { NextResponse } from "next/server";
import { getCategories } from "../../../lib/demo-data";

export function GET() {
  return NextResponse.json({ data: getCategories(), source: "demo" }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
}
