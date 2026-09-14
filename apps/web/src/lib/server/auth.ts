import "server-only";
import { randomUUID } from "node:crypto";
import {
  canonicalizeUsername,
  createAuthService,
  createInMemoryLoginAttemptProtection,
  createInMemoryOidcReplayGuard,
  decodeJwtPayload,
  isSessionUsable,
  oidcCallbackUrl,
  safeRedirect,
  validateOidcClaims,
  type OidcClaims,
} from "@dashboard/auth";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { OAuthConfig } from "next-auth/providers/oauth";
import {
  PermissionError,
  requirePermission as assertPermission,
  type Permission,
} from "@dashboard/permissions";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthSessionConfiguration, serverEnv } from "../env";
import { getDatabase } from "./database";
import {
  completeOidcLogin,
  fetchOidcDiscovery,
  loadOidcRuntime,
  recordAudit,
} from "./security-services";

if (!process.env.NEXTAUTH_URL) process.env.NEXTAUTH_URL = serverEnv.APP_URL;

function authSecret(): string {
  if (!serverEnv.AUTH_SECRET)
    throw new Error("AUTH_SECRET must contain at least 32 characters when authentication is used");
  return serverEnv.AUTH_SECRET;
}
const sessionConfiguration = getAuthSessionConfiguration(serverEnv);
const loginProtection = createInMemoryLoginAttemptProtection();
const oidcReplayGuard = createInMemoryOidcReplayGuard();

async function requestUserAgent(): Promise<string | null> {
  try {
    return (await headers()).get("user-agent");
  } catch {
    return null;
  }
}

function oidcProvider(input: {
  displayName: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint?: string;
}): OAuthConfig<Record<string, unknown>> {
  return {
    id: "oidc",
    name: input.displayName,
    type: "oauth",
    idToken: true,
    checks: ["pkce", "state", "nonce"],
    issuer: input.issuer,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    authorization: {
      url: input.authorizationEndpoint,
      params: { scope: input.scopes, response_type: "code" },
    },
    token: input.tokenEndpoint,
    jwks_endpoint: input.jwksUri,
    ...(input.userinfoEndpoint ? { userinfo: input.userinfoEndpoint } : {}),
    profile(profile) {
      const sub = String(profile.sub ?? "");
      return {
        id: sub,
        name: typeof profile.name === "string" ? profile.name : sub,
        username: sub,
        displayName: typeof profile.name === "string" ? profile.name : null,
        isSystemAdmin: false,
        authVersion: 1,
      };
    },
  };
}

let authOptionsCache: { value: NextAuthOptions; expiresAt: number } | undefined;

export function clearAuthOptionsCache(): void {
  authOptionsCache = undefined;
}

export async function getAuthOptions(): Promise<NextAuthOptions> {
  const now = Date.now();
  if (authOptionsCache && authOptionsCache.expiresAt > now) return authOptionsCache.value;
  const providers: NextAuthOptions["providers"] = [
    CredentialsProvider({
      name: "Local account",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        authSecret();
        const runtime = await loadOidcRuntime();
        if (runtime.settings.enabled && !runtime.settings.allowLocalLogin) return null;
        if (!credentials?.username || !credentials.password) return null;
        const key = canonicalizeUsername(credentials.username);
        if (!loginProtection.consume(key)) {
          await recordAudit({
            action: "auth.login.failure",
            targetType: "user",
            outcome: "failure",
            metadata: { reason: "rate_limited" },
          });
          return null;
        }
        try {
          const { authStore } = await getDatabase();
          const user = await createAuthService(authStore).authenticate(
            credentials.username,
            credentials.password,
          );
          loginProtection.reset(key);
          await recordAudit({
            actorUserId: user.id,
            action: "auth.login.success",
            targetType: "user",
            targetId: user.id,
            outcome: "success",
          });
          return {
            id: user.id,
            name: user.displayName ?? user.username,
            username: user.username,
            displayName: user.displayName,
            isSystemAdmin: user.isSystemAdmin,
            authVersion: user.authVersion,
          };
        } catch {
          await recordAudit({
            action: "auth.login.failure",
            targetType: "user",
            outcome: "failure",
          });
          return null;
        }
      },
    }),
  ];
  try {
    const runtime = await loadOidcRuntime();
    if (
      runtime.settings.enabled &&
      runtime.settings.issuer &&
      runtime.settings.clientId &&
      runtime.clientSecret
    ) {
      const discovery = await fetchOidcDiscovery(runtime.settings.issuer);
      providers.push(
        oidcProvider({
          displayName: runtime.settings.displayName ?? "OpenID Connect",
          issuer: discovery.issuer,
          clientId: runtime.settings.clientId,
          clientSecret: runtime.clientSecret,
          scopes: runtime.settings.scopes,
          authorizationEndpoint: discovery.authorization_endpoint,
          tokenEndpoint: discovery.token_endpoint,
          jwksUri: discovery.jwks_uri,
          ...(discovery.userinfo_endpoint ? { userinfoEndpoint: discovery.userinfo_endpoint } : {}),
        }),
      );
    }
  } catch {
    // OIDC stays disabled if discovery or secrets fail. Local login remains available.
  }
  const useSecureCookies = serverEnv.APP_URL.startsWith("https:");
  const options: NextAuthOptions = {
    ...(serverEnv.AUTH_SECRET ? { secret: serverEnv.AUTH_SECRET } : {}),
    useSecureCookies,
    cookies: {
      sessionToken: {
        name: `${useSecureCookies ? "__Secure-" : ""}next-auth.session-token`,
        options: {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: useSecureCookies,
        },
      },
    },
    session: { strategy: "jwt", ...sessionConfiguration },
    jwt: { maxAge: sessionConfiguration.maxAge },
    pages: { signIn: "/login", error: "/login" },
    providers,
    callbacks: {
      async signIn({ user, account }) {
        if (!account || account.provider !== "oidc") return true;
        const runtime = await loadOidcRuntime();
        if (!runtime.settings.enabled || !runtime.settings.issuer || !runtime.settings.clientId)
          return "/login?error=oidc";
        const idToken = account.id_token;
        if (!idToken) return "/login?error=oidc";
        const payload = decodeJwtPayload(idToken);
        const nonce = typeof payload.nonce === "string" ? payload.nonce : "";
        try {
          oidcReplayGuard.consume("nonce", nonce);
          validateOidcClaims({
            claims: payload as OidcClaims,
            expectedIssuer: runtime.settings.issuer,
            expectedAudience: runtime.settings.clientId,
          });
          const result = await completeOidcLogin({
            issuer: runtime.settings.issuer,
            claims: payload as OidcClaims,
            groupClaim: runtime.settings.groupClaim,
          });
          if (!result.ok) return `/login?error=${result.reason.toLowerCase()}`;
          user.id = result.user.id;
          user.username = result.user.username;
          user.displayName = result.user.displayName;
          user.isSystemAdmin = result.user.isSystemAdmin;
          user.authVersion = result.user.authVersion;
          return true;
        } catch {
          await recordAudit({
            action: "auth.oidc.login",
            targetType: "user",
            outcome: "failure",
          });
          return "/login?error=oidc";
        }
      },
      async jwt({ token, user }) {
        if (user) {
          const sessionId = randomUUID();
          token.sessionId = sessionId;
          token.username = user.username;
          token.displayName = user.displayName;
          token.isSystemAdmin = user.isSystemAdmin;
          token.authVersion = user.authVersion;
          token.sub = user.id;
          const { securityStore } = await getDatabase();
          await securityStore.createSession({
            id: sessionId,
            userId: user.id,
            expiresAt: new Date(Date.now() + sessionConfiguration.maxAge * 1000),
            userAgent: await requestUserAgent(),
            ip: null,
          });
          return token;
        }
        if (typeof token.sessionId !== "string" || !token.sub) return {};
        const { securityStore } = await getDatabase();
        const tracked = await securityStore.findSession(token.sessionId);
        if (!tracked || !isSessionUsable(tracked) || tracked.userId !== token.sub) return {};
        return token;
      },
      async session({ session, token }) {
        const empty = {
          ...session,
          user: {
            ...session.user,
            id: "",
            username: "",
            displayName: null,
            isSystemAdmin: false,
          },
          sessionId: undefined,
        };
        if (
          !token.sub ||
          typeof token.authVersion !== "number" ||
          typeof token.sessionId !== "string"
        )
          return empty;
        const { authStore, securityStore } = await getDatabase();
        const tracked = await securityStore.findSession(token.sessionId);
        if (!tracked || !isSessionUsable(tracked) || tracked.userId !== token.sub) return empty;
        const user = await createAuthService(authStore).validateSession(
          token.sub,
          token.authVersion,
        );
        if (Date.now() - tracked.lastSeenAt.getTime() > 60_000)
          await securityStore.touchSession(token.sessionId);
        session.user = {
          ...session.user,
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          isSystemAdmin: user.isSystemAdmin,
        };
        session.sessionId = token.sessionId;
        return session;
      },
      redirect({ url, baseUrl }) {
        if (url.startsWith("/api/auth/callback/")) {
          try {
            return new URL(url, baseUrl).href === oidcCallbackUrl(baseUrl)
              ? new URL(url, baseUrl).href
              : baseUrl;
          } catch {
            return baseUrl;
          }
        }
        return safeRedirect(url, baseUrl);
      },
    },
  };
  authOptionsCache = { value: options, expiresAt: Date.now() + 15_000 };
  return options;
}

export async function requireSession() {
  const session = await getServerSession(await getAuthOptions());
  if (!session?.user?.id) throw new Error("AUTH_REQUIRED");
  return session;
}
export async function requireServerPermission(permission: Permission) {
  const session = await requireSession();
  const { authStore } = await getDatabase();
  const subject = await authStore.resolvePermissionSubject(session.user.id);
  if (!subject) throw new Error("AUTH_REQUIRED");
  assertPermission(subject, permission);
  return session;
}

export async function requireAdminPagePermission(permission: Permission) {
  try {
    return await requireServerPermission(permission);
  } catch (error) {
    if (error instanceof PermissionError) redirect("/forbidden");
    if (error instanceof Error && error.message === "AUTH_REQUIRED") redirect("/login");
    throw error;
  }
}
