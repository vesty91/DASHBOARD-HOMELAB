import { expect, test } from "@playwright/test";

test("login page enforces security headers and CSP", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.ok()).toBeTruthy();
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("worker-src 'self' blob:");
  expect(headers["content-security-policy"]).toContain("manifest-src 'self'");
  // next dev needs 'unsafe-eval' for React; production CSP still forbids it
  // (see dashboardCsp() unit test / NODE_ENV=production next.config headers).
  expect(headers["content-security-policy"]).toContain("unsafe-eval");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
});

test("tRPC HTTP API rejects GET", async ({ request }) => {
  const response = await request.get("/api/trpc/oidc.publicConfig");
  expect(response.status()).toBe(405);
});

test("health live stays 200 and keeps CSP without leaking secrets", async ({ request }) => {
  const response = await request.get("/health/live");
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("unsafe-eval");
  const body = await response.json();
  expect(body.status).toBe("live");
  expect(body.version).toBe("1.8.1");
  expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL|REDIS_URL|AUTH_SECRET|postgresql:\/\//iu);
});

test("health ready probes the database without exposing connection strings", async ({
  request,
}) => {
  const response = await request.get("/health/ready");
  expect([200, 503]).toContain(response.status());
  const body = await response.json();
  expect(body.status === "ready" || body.status === "not-ready").toBe(true);
  expect(JSON.stringify(body)).not.toMatch(/DATABASE_URL|REDIS_URL|AUTH_SECRET|postgresql:\/\//iu);
});
