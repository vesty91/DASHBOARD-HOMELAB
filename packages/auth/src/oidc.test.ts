import { describe, expect, it } from "vitest";
import { AuthError } from "./errors";
import {
  applyOidcGroupMapping,
  assertAllowedOidcRedirect,
  createInMemoryOidcReplayGuard,
  decodeJwtPayload,
  extractOidcGroups,
  oidcCallbackUrl,
  oidcProvisionUsername,
  parseOidcDiscovery,
  parseOidcIssuerUrl,
  resolveOidcAccountLink,
  validateOidcClaims,
} from "./oidc";

function claims(overrides: Partial<Parameters<typeof validateOidcClaims>[0]["claims"]> = {}) {
  return {
    iss: "https://id.example/realms/homelab",
    sub: "user-sub-1",
    aud: "dashboard-client",
    exp: 1_800_000_000,
    iat: 1_700_000_000,
    nonce: "nonce-1",
    email: "owner@example.test",
    email_verified: true,
    ...overrides,
  };
}

describe("OIDC claims and linking", () => {
  it("rejects invalid issuer URLs and arbitrary redirects", () => {
    expect(() => parseOidcIssuerUrl("file:///etc/passwd")).toThrow(AuthError);
    expect(() => parseOidcIssuerUrl("https://user:pass@id.example")).toThrow(AuthError);
    expect(oidcCallbackUrl("https://dashboard.example")).toBe(
      "https://dashboard.example/api/auth/callback/oidc",
    );
    expect(
      assertAllowedOidcRedirect(
        "https://dashboard.example/api/auth/callback/oidc",
        "https://dashboard.example",
      ),
    ).toBe("https://dashboard.example/api/auth/callback/oidc");
    expect(() =>
      assertAllowedOidcRedirect("https://evil.example/callback", "https://dashboard.example"),
    ).toThrow(AuthError);
  });

  it("validates issuer, audience, expiry and nonce", () => {
    const now = 1_700_000_100;
    expect(() =>
      validateOidcClaims({
        claims: claims(),
        expectedIssuer: "https://id.example/realms/homelab",
        expectedAudience: "dashboard-client",
        expectedNonce: "nonce-1",
        nowSeconds: now,
      }),
    ).not.toThrow();
    expect(() =>
      validateOidcClaims({
        claims: claims({ iss: "https://evil.example" }),
        expectedIssuer: "https://id.example/realms/homelab",
        expectedAudience: "dashboard-client",
        expectedNonce: "nonce-1",
        nowSeconds: now,
      }),
    ).toThrow(AuthError);
    try {
      validateOidcClaims({
        claims: claims({ iss: "https://evil.example" }),
        expectedIssuer: "https://id.example/realms/homelab",
        expectedAudience: "dashboard-client",
        expectedNonce: "nonce-1",
        nowSeconds: now,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "OIDC_INVALID_ISSUER" });
    }
    try {
      validateOidcClaims({
        claims: claims({ aud: "other-client" }),
        expectedIssuer: "https://id.example/realms/homelab",
        expectedAudience: "dashboard-client",
        expectedNonce: "nonce-1",
        nowSeconds: now,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "OIDC_INVALID_AUDIENCE" });
    }
    try {
      validateOidcClaims({
        claims: claims({ exp: now - 121 }),
        expectedIssuer: "https://id.example/realms/homelab",
        expectedAudience: "dashboard-client",
        expectedNonce: "nonce-1",
        nowSeconds: now,
        clockSkewSeconds: 60,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "OIDC_TOKEN_EXPIRED" });
    }
    try {
      validateOidcClaims({
        claims: claims({ nonce: "other" }),
        expectedIssuer: "https://id.example/realms/homelab",
        expectedAudience: "dashboard-client",
        expectedNonce: "nonce-1",
        nowSeconds: now,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "OIDC_INVALID_NONCE" });
    }
    try {
      validateOidcClaims({
        claims: claims({ nonce: "" }),
        expectedIssuer: "https://id.example/realms/homelab",
        expectedAudience: "dashboard-client",
        nowSeconds: now,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "OIDC_INVALID_NONCE" });
    }
    try {
      validateOidcClaims({
        claims: claims({ exp: now - 121 }),
        expectedIssuer: "https://id.example/realms/homelab",
        expectedAudience: "dashboard-client",
        expectedNonce: "nonce-1",
        nowSeconds: now,
        clockSkewSeconds: 10_000,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "OIDC_TOKEN_EXPIRED" });
    }
  });

  it("rejects replayed state and nonce", () => {
    const guard = createInMemoryOidcReplayGuard(60_000);
    guard.consume("state", "abc");
    expect(() => guard.consume("state", "abc")).toThrow(AuthError);
    guard.consume("nonce", "n1");
    expect(() => guard.consume("nonce", "n1")).toThrow(AuthError);
  });

  it("does not auto-link unverified email and ignores unknown groups", () => {
    expect(
      resolveOidcAccountLink({
        existingUserByEmailId: "user-1",
        email: "owner@example.test",
        emailVerified: false,
        autoLinkVerifiedEmail: true,
        autoProvision: false,
      }),
    ).toEqual({ action: "reject", reason: "UNVERIFIED_EMAIL" });
    expect(
      resolveOidcAccountLink({
        existingUserByEmailId: "user-1",
        email: "owner@example.test",
        emailVerified: true,
        autoLinkVerifiedEmail: false,
        autoProvision: false,
      }),
    ).toEqual({ action: "reject", reason: "EMAIL_COLLISION" });
    expect(
      resolveOidcAccountLink({
        existingIdentityUserId: "user-1",
        existingUserByEmailId: "user-2",
        emailVerified: true,
        autoLinkVerifiedEmail: true,
        autoProvision: false,
      }),
    ).toEqual({ action: "reject", reason: "EMAIL_COLLISION" });
    expect(
      applyOidcGroupMapping({
        oidcGroups: ["admins", "unknown-team"],
        mappings: [{ oidcGroup: "admins", localGroupId: "g-admin" }],
        currentMappedMemberships: ["g-admin"],
      }),
    ).toEqual({ add: [], remove: [] });
    expect(
      applyOidcGroupMapping({
        oidcGroups: ["unknown-team"],
        mappings: [
          { oidcGroup: "admins", localGroupId: "g-admin" },
          { oidcGroup: "ops", localGroupId: "g-ops" },
        ],
        currentMappedMemberships: ["g-admin", "g-ops"],
      }),
    ).toEqual({ add: [], remove: ["g-admin", "g-ops"] });
    expect(extractOidcGroups({ groups: ["a", 1, "b"] }, "groups")).toEqual(["a", "b"]);
    expect(extractOidcGroups({ groups: { cn: "admins" } }, "groups")).toEqual([]);
    expect(extractOidcGroups({ groups: null }, "groups")).toEqual([]);
    expect(
      parseOidcDiscovery({
        issuer: "https://id.example/realms/homelab",
        authorization_endpoint: "https://id.example/auth",
        token_endpoint: "https://id.example/token",
        jwks_uri: "https://id.example/jwks",
      }).issuer,
    ).toBe("https://id.example/realms/homelab");
    const payload = decodeJwtPayload(
      `header.${Buffer.from(JSON.stringify({ sub: "abc" }), "utf8").toString("base64url")}.sig`,
    );
    expect(payload.sub).toBe("abc");
    expect(oidcProvisionUsername({ preferredUsername: "Vesty", subject: "s" })).toBe("vesty");
  });
});
