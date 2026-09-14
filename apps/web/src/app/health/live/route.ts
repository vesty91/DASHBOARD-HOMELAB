import { NextResponse } from "next/server";
import { liveHealthBody } from "@/lib/server/health-live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(liveHealthBody());
}
