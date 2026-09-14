import { describe, expect, it } from "vitest";
import {
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
  });
});
