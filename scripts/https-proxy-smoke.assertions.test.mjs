import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  assertCsp,
  cookieFlagReport,
  isHttpsRedirect,
  missingSecurityHeaders,
  sessionCookieViolations,
} from "./https-proxy-smoke.assertions.mjs";

test("HTTPS responses require CSP, nosniff, HSTS; HTTP does not require HSTS", () => {
  const httpsHeaders = {
    "Content-Security-Policy": "default-src 'self'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=()",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  };
  assert.deepEqual(missingSecurityHeaders(httpsHeaders, { https: true }), []);
  assert.deepEqual(missingSecurityHeaders(httpsHeaders, { https: false }), []);
  assert.deepEqual(missingSecurityHeaders({}, { https: true }), [
    "content-security-policy",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "strict-transport-security",
  ]);
});

test("CSP assertion rejects unsafe-eval", () => {
  assert.throws(
    () => assertCsp("default-src 'self'; frame-ancestors 'none'; script-src 'unsafe-eval'"),
    /unsafe-eval/,
  );
  assertCsp("default-src 'self'; frame-ancestors 'none'");
});

test("HTTP redirect must land on the public HTTPS origin including port", () => {
  assert.equal(
    isHttpsRedirect(308, "https://127.0.0.1:8443/health/live", "https://127.0.0.1:8443"),
    true,
  );
  assert.equal(
    isHttpsRedirect(308, "https://127.0.0.1/health/live", "https://127.0.0.1:8443"),
    false,
  );
  assert.equal(isHttpsRedirect(200, "https://127.0.0.1:8443/", "https://127.0.0.1:8443"), false);
});

test("session and __Secure- cookies require Secure; session requires HttpOnly", () => {
  const cookies = cookieFlagReport([
    "__Secure-next-auth.session-token=abc; Path=/; HttpOnly; Secure; SameSite=Lax",
    "next-auth.csrf-token=xyz; Path=/; SameSite=Lax",
  ]);
  assert.deepEqual(sessionCookieViolations(cookies), []);
  assert.deepEqual(
    sessionCookieViolations(cookieFlagReport("next-auth.session-token=abc; Path=/; SameSite=Lax")),
    ["next-auth.session-token missing Secure", "next-auth.session-token missing HttpOnly"],
  );
});

test("smoke Caddyfile keeps production reverse_proxy and uses local TLS only", async () => {
  const production = await readFile("deploy/Caddyfile", "utf8");
  const smoke = await readFile("deploy/Caddyfile.https-smoke", "utf8");
  assert.match(production, /reverse_proxy web:3000/);
  assert.match(production, /reverse_proxy realtime:3002/);
  assert.match(production, /uri strip_prefix \/api\/realtime/);
  assert.match(smoke, /reverse_proxy web:3000/);
  assert.match(smoke, /reverse_proxy realtime:3002/);
  assert.match(smoke, /tls \/etc\/caddy\/certs\/cert\.pem/);
  assert.match(smoke, /flush_interval -1/);
  assert.doesNotMatch(production, /tls internal/);
  assert.doesNotMatch(production, /\/etc\/caddy\/certs/);
});
