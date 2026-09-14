import { expect, test } from "@playwright/test";

test("login page enforces security headers and CSP", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.ok()).toBeTruthy();
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
});

test("tRPC HTTP API rejects GET", async ({ request }) => {
  const response = await request.get("/api/trpc/oidc.publicConfig");
  expect(response.status()).toBe(405);
});
