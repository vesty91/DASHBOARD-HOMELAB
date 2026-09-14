import { z } from "zod";
import { AuthError } from "./errors";
import { canonicalizeUsername } from "./service";

export const OIDC_CALLBACK_PATH = "/api/auth/callback/oidc";
export const OIDC_DEFAULT_SCOPES = "openid profile email groups";
export const OIDC_DEFAULT_GROUP_CLAIM = "groups";
export const OIDC_CLOCK_SKEW_SECONDS = 60;
const OIDC_MAX_CLOCK_SKEW_SECONDS = 120;

const issuerUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  }, "Invalid OIDC issuer");

export const oidcSettingsInputSchema = z.object({
  enabled: z.boolean(),
  issuer: issuerUrlSchema.nullable(),
  clientId: z.string().trim().min(1).max(200).nullable(),
  displayName: z.string().trim().min(1).max(80).nullable(),
  scopes: z.string().trim().min(1).max(300).default(OIDC_DEFAULT_SCOPES),
  redirectUri: z.string().trim().url().nullable(),
  groupClaim: z.string().trim().min(1).max(80).default(OIDC_DEFAULT_GROUP_CLAIM),
  autoLinkVerifiedEmail: z.boolean().default(false),
  autoProvision: z.boolean().default(false),
  allowLocalLogin: z.boolean().default(true),
  clientSecret: z.string().min(1).max(4000).optional(),
});

export type OidcSettingsInput = z.infer<typeof oidcSettingsInputSchema>;

export const oidcDiscoverySchema = z
  .object({
    issuer: z.string().min(1),
    authorization_endpoint: z.string().url(),
    token_endpoint: z.string().url(),
    jwks_uri: z.string().url(),
    userinfo_endpoint: z.string().url().optional(),
    id_token_signing_alg_values_supported: z.array(z.string()).optional(),
  })
  .passthrough();

export type OidcDiscovery = z.infer<typeof oidcDiscoverySchema>;

export interface OidcClaims {
  iss: string;
  sub: string;
  aud: string | readonly string[];
  exp: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
  name?: string;
  [claim: string]: unknown;
}

export function normalizeIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/u, "");
}

export function parseOidcIssuerUrl(value: string): URL {
  const parsed = issuerUrlSchema.safeParse(value);
  if (!parsed.success) throw new AuthError("OIDC_INVALID_ISSUER", "OIDC issuer is invalid");
  return new URL(parsed.data);
}

export function oidcCallbackUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/u, "")}${OIDC_CALLBACK_PATH}`;
}

export function assertAllowedOidcRedirect(url: string, appUrl: string): string {
  const allowed = oidcCallbackUrl(appUrl);
  let candidate: URL;
  try {
    candidate = new URL(url);
  } catch {
    throw new AuthError("OIDC_REDIRECT_FORBIDDEN", "OIDC redirect is not allowed");
  }
  let expected: URL;
  try {
    expected = new URL(allowed);
  } catch {
    throw new AuthError("OIDC_REDIRECT_FORBIDDEN", "OIDC redirect is not allowed");
  }
  if (candidate.href !== expected.href)
    throw new AuthError("OIDC_REDIRECT_FORBIDDEN", "OIDC redirect is not allowed");
  return candidate.href;
}

export function discoveryUrl(issuer: string): string {
  return `${normalizeIssuer(issuer)}/.well-known/openid-configuration`;
}

export function parseOidcDiscovery(input: unknown): OidcDiscovery {
  const parsed = oidcDiscoverySchema.safeParse(input);
  if (!parsed.success)
    throw new AuthError("OIDC_MISCONFIGURED", "OIDC discovery document is invalid");
  return parsed.data;
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1])
    throw new AuthError("OIDC_MISCONFIGURED", "OIDC token is invalid");
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new AuthError("OIDC_MISCONFIGURED", "OIDC token is invalid");
  }
}

function asAudience(value: string | readonly string[]): readonly string[] {
  return typeof value === "string" ? [value] : [...value];
}

export function validateOidcClaims(input: {
  claims: OidcClaims;
  expectedIssuer: string;
  expectedAudience: string;
  expectedNonce: string;
  nowSeconds?: number;
  clockSkewSeconds?: number;
}): void {
  const skew = Math.min(
    Math.max(input.clockSkewSeconds ?? OIDC_CLOCK_SKEW_SECONDS, 0),
    OIDC_MAX_CLOCK_SKEW_SECONDS,
  );
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (normalizeIssuer(input.claims.iss) !== normalizeIssuer(input.expectedIssuer))
    throw new AuthError("OIDC_INVALID_ISSUER", "OIDC issuer is invalid");
  if (!asAudience(input.claims.aud).includes(input.expectedAudience))
    throw new AuthError("OIDC_INVALID_AUDIENCE", "OIDC audience is invalid");
  if (typeof input.claims.exp !== "number" || input.claims.exp + skew < now)
    throw new AuthError("OIDC_TOKEN_EXPIRED", "OIDC token is expired");
  if (typeof input.claims.iat === "number" && input.claims.iat - skew > now)
    throw new AuthError("OIDC_TOKEN_EXPIRED", "OIDC token is expired");
  if (!input.claims.nonce || input.claims.nonce !== input.expectedNonce)
    throw new AuthError("OIDC_INVALID_NONCE", "OIDC nonce is invalid");
  if (!input.claims.sub || typeof input.claims.sub !== "string")
    throw new AuthError("OIDC_MISCONFIGURED", "OIDC subject is invalid");
}

export function extractOidcGroups(claims: Record<string, unknown>, claimName: string): string[] {
  const raw = claims[claimName];
  if (raw == null) return [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export type OidcLinkDecision =
  | { action: "login"; userId: string }
  | { action: "link-email"; userId: string }
  | { action: "provision" }
  | { action: "reject"; reason: "NO_ACCOUNT" | "EMAIL_COLLISION" | "UNVERIFIED_EMAIL" };

export function resolveOidcAccountLink(input: {
  existingIdentityUserId?: string;
  existingUserByEmailId?: string;
  email?: string | null;
  emailVerified: boolean;
  autoLinkVerifiedEmail: boolean;
  autoProvision: boolean;
}): OidcLinkDecision {
  if (input.existingIdentityUserId) {
    if (
      input.existingUserByEmailId &&
      input.existingUserByEmailId !== input.existingIdentityUserId
    ) {
      return { action: "reject", reason: "EMAIL_COLLISION" };
    }
    return { action: "login", userId: input.existingIdentityUserId };
  }
  if (input.autoLinkVerifiedEmail && input.existingUserByEmailId) {
    if (!input.emailVerified) return { action: "reject", reason: "UNVERIFIED_EMAIL" };
    return { action: "link-email", userId: input.existingUserByEmailId };
  }
  if (input.existingUserByEmailId && !input.autoLinkVerifiedEmail)
    return { action: "reject", reason: "EMAIL_COLLISION" };
  if (input.autoProvision) return { action: "provision" };
  return { action: "reject", reason: "NO_ACCOUNT" };
}

export function applyOidcGroupMapping(input: {
  oidcGroups: readonly string[];
  mappings: readonly { oidcGroup: string; localGroupId: string }[];
  currentMappedMemberships: readonly string[];
}): { add: string[]; remove: string[] } {
  const claimed = new Set(input.oidcGroups);
  const mappedIds = new Set(input.mappings.map((mapping) => mapping.localGroupId));
  const desired = new Set(
    input.mappings.filter((mapping) => claimed.has(mapping.oidcGroup)).map((m) => m.localGroupId),
  );
  const add = [...desired].filter((id) => !input.currentMappedMemberships.includes(id));
  const remove = input.currentMappedMemberships.filter(
    (id) => mappedIds.has(id) && !desired.has(id),
  );
  return { add, remove };
}

export function oidcProvisionUsername(input: {
  preferredUsername?: string;
  email?: string | null;
  subject: string;
}): string {
  const fromPreferred = input.preferredUsername
    ? canonicalizeUsername(input.preferredUsername)
    : "";
  if (fromPreferred.length >= 3) return fromPreferred.slice(0, 64);
  const localPart = input.email?.split("@")[0];
  const fromEmail = localPart ? canonicalizeUsername(localPart) : "";
  if (fromEmail.length >= 3) return fromEmail.slice(0, 64);
  return canonicalizeUsername(
    `oidc-${input.subject.replace(/[^a-zA-Z0-9._-]/gu, "").slice(0, 40)}`,
  );
}

export function createInMemoryOidcReplayGuard(ttlMs = 10 * 60_000) {
  const used = new Map<string, number>();
  function prune(now: number) {
    for (const [key, expiresAt] of used) if (expiresAt <= now) used.delete(key);
  }
  return {
    consume(kind: "state" | "nonce", value: string): void {
      const now = Date.now();
      prune(now);
      const key = `${kind}:${value}`;
      if (!value || used.has(key))
        throw new AuthError(
          kind === "state" ? "OIDC_INVALID_STATE" : "OIDC_INVALID_NONCE",
          "OIDC replay was rejected",
        );
      used.set(key, now + ttlMs);
    },
  };
}
