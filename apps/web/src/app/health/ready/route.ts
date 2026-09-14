import { NextResponse } from "next/server";
import { readyHealth } from "@/lib/server/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await readyHealth();
  return NextResponse.json(result.body, { status: result.status });
}
