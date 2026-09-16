import { describe, expect, it } from "vitest";
import {
  applyRuntimeSecurityHeaders,
  dashboardCsp,
  isSameAppOrigin,
  securityHeaders,
  serverActionAllowedOrigins,
} from "./security-headers";

describe("HTTP security headers", () => {
  it("emits an enforceable CSP without eval and enables HSTS only for HTTPS", () => {
    const csp = dashboardCsp();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
    const http = securityHeaders("http://localhost:3000").map((header) => header.key);
    expect(http).not.toContain("Strict-Transport-Security");
    const https = securityHeaders("https://dashboard.example");
    expect(https.some((header) => header.key === "Strict-Transport-Security")).toBe(true);
    expect(serverActionAllowedOrigins("https://dashboard.example:8443")).toEqual([
      "dashboard.example:8443",
    ]);
    expect(isSameAppOrigin(null, "https://dashboard.example")).toBe(true);
    expect(isSameAppOrigin("https://dashboard.example", "https://dashboard.example/app")).toBe(
      true,
    );
    expect(isSameAppOrigin("https://evil.example", "https://dashboard.example")).toBe(false);
    const runtime = new Map<string, string>();
    applyRuntimeSecurityHeaders(
      { set: (name, value) => runtime.set(name, value) },
      "https://dashboard.example",
    );
    expect(runtime.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    runtime.clear();
    applyRuntimeSecurityHeaders(
      { set: (name, value) => runtime.set(name, value) },
      "http://localhost:3000",
    );
    expect(runtime.size).toBe(0);
  });
});
