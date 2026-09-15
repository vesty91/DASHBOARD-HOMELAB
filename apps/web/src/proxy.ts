import { NextResponse } from "next/server";
import { applyRuntimeSecurityHeaders } from "./lib/security-headers";

export function proxy(): NextResponse {
  const response = NextResponse.next();
  applyRuntimeSecurityHeaders(response.headers, process.env.APP_URL ?? "http://localhost:3000");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
