import "server-only";
import { randomUUID } from "node:crypto";
import {
  applyOidcGroupMapping,
  assertAllowedOidcRedirect,
  canonicalizeUsername,
  extractOidcGroups,
  oidcCallbackUrl,
  oidcProvisionUsername,
  parseOidcDiscovery,
  parseOidcIssuerUrl,
  resolveOidcAccountLink,
  type AuditEventInput,
  type OidcClaims,
  type OidcSettingsInput,
} from "@dashboard/auth";
import { encryptSecret, decryptSecret, createEnvKeyring } from "@dashboard/secrets";
import { parseJsonBody, secureRequest } from "@dashboard/integrations";
import { serverEnv } from "../env";
import { getDatabase } from "./database";

const OIDC_BINDING = "system:oidc";
const OIDC_SECRET_KEY = "client_secret";

function keyring() {
  return createEnvKeyring(serverEnv.SECRET_ENCRYPTION_KEY);
}

export async function recordAudit(event: AuditEventInput): Promise<void> {
  try {
    const { securityStore } = await getDatabase();
    await securityStore.recordAudit(event);
  } catch (error) {
    void error;
    console.error(JSON.stringify({ msg: "audit_write_failed" }));
  }
}

export async function fetchOidcDiscovery(issuer: string) {
  parseOidcIssuerUrl(issuer);
  const url = `${issuer.replace(/\/+$/u, "")}/.well-known/openid-configuration`;
  const result = await secureRequest({
    url,
    method: "GET",
    timeoutMs: 5_000,
    maxBodyBytes: 64 * 1024,
    maxRedirects: 0,
    maxRetries: 0,
  });
  if (!result.ok) throw new Error("OIDC_MISCONFIGURED");
  return parseOidcDiscovery(parseJsonBody(result.body));
}

export async function loadOidcRuntime() {
  const { securityStore } = await getDatabase();
  const settings = await securityStore.getOidcSettings();
  const secret = await securityStore.getOidcSecret();
  const ring = keyring();
  const decrypted =
    secret && ring
      ? decryptSecret(ring, {
          integrationId: OIDC_BINDING,
          key: OIDC_SECRET_KEY,
          ...secret,
        })
      : undefined;
  return { settings, clientSecret: decrypted };
}

export async function completeOidcLogin(input: {
  issuer: string;
  claims: OidcClaims;
  groupClaim: string;
}) {
  const { authStore, securityStore } = await getDatabase();
  const settings = await securityStore.getOidcSettings();
  if (!settings.enabled || !settings.issuer || !settings.clientId) throw new Error("OIDC_DISABLED");
  const email = typeof input.claims.email === "string" ? input.claims.email : null;
  const emailVerified = input.claims.email_verified === true;
  const identity = await securityStore.findOidcIdentity(input.issuer, input.claims.sub);
  const byEmail = email ? await authStore.findUserByEmail(email) : undefined;
  const decision = resolveOidcAccountLink({
    ...(identity ? { existingIdentityUserId: identity.userId } : {}),
    ...(byEmail ? { existingUserByEmailId: byEmail.id } : {}),
    email,
    emailVerified,
    autoLinkVerifiedEmail: settings.autoLinkVerifiedEmail,
    autoProvision: settings.autoProvision,
  });
  if (decision.action === "reject") return { ok: false as const, reason: decision.reason };
  let userId: string;
  let linked = false;
  if (decision.action === "provision") {
    const username = oidcProvisionUsername({
      ...(typeof input.claims.preferred_username === "string"
        ? { preferredUsername: input.claims.preferred_username }
        : {}),
      email,
      subject: input.claims.sub,
    });
    const existingName = await authStore.findUserByCanonicalUsername(username);
    const unique = existingName
      ? canonicalizeUsername(`${username}-${randomUUID().slice(0, 8)}`)
      : username;
    const created = await authStore.createOidcProvisionedUser({
      username: unique,
      usernameCanonical: unique,
      email,
      displayName: typeof input.claims.name === "string" ? input.claims.name : null,
    });
    userId = created.id;
    await securityStore.linkOidcIdentity({
      userId,
      issuer: input.issuer,
      subject: input.claims.sub,
      email,
    });
    linked = true;
  } else {
    userId = decision.userId;
    if (decision.action === "link-email") {
      await securityStore.linkOidcIdentity({
        userId,
        issuer: input.issuer,
        subject: input.claims.sub,
        email,
      });
      linked = true;
    }
  }
  const user = await authStore.findUser(userId);
  if (!user || user.status !== "active")
    return { ok: false as const, reason: "NO_ACCOUNT" as const };
  const mappings = await securityStore.listOidcMappings();
  const memberships = await authStore.listUserGroupIds(userId);
  const mappedIds = new Set(mappings.map((mapping) => mapping.localGroupId));
  const currentMapped = memberships.filter((id) => mappedIds.has(id));
  const change = applyOidcGroupMapping({
    oidcGroups: extractOidcGroups(input.claims, input.groupClaim),
    mappings,
    currentMappedMemberships: currentMapped,
  });
  for (const groupId of change.add) await authStore.addGroupMember(groupId, userId);
  for (const groupId of change.remove) await authStore.removeGroupMember(groupId, userId);
  await authStore.markLogin(userId);
  await recordAudit({
    actorUserId: userId,
    action: linked ? "auth.oidc.link" : "auth.oidc.login",
    targetType: "user",
    targetId: userId,
    outcome: "success",
    metadata: { issuer: input.issuer },
  });
  return { ok: true as const, user, linked };
}

export async function saveOidcSettings(input: OidcSettingsInput) {
  const { securityStore } = await getDatabase();
  if (input.issuer) parseOidcIssuerUrl(input.issuer);
  const redirectUri = input.redirectUri
    ? assertAllowedOidcRedirect(input.redirectUri, serverEnv.APP_URL)
    : oidcCallbackUrl(serverEnv.APP_URL);
  await securityStore.saveOidcSettings({
    enabled: input.enabled,
    issuer: input.issuer,
    clientId: input.clientId,
    displayName: input.displayName,
    scopes: input.scopes,
    redirectUri,
    groupClaim: input.groupClaim,
    autoLinkVerifiedEmail: input.autoLinkVerifiedEmail,
    autoProvision: input.autoProvision,
    allowLocalLogin: input.allowLocalLogin,
  });
  if (input.clientSecret) {
    const ring = keyring();
    if (!ring) throw new Error("SECRETS_NOT_CONFIGURED");
    const encrypted = encryptSecret(ring, {
      integrationId: OIDC_BINDING,
      key: OIDC_SECRET_KEY,
      plaintext: input.clientSecret,
    });
    await securityStore.setOidcSecret(encrypted);
  }
}
