import "server-only";
import {
  canonicalizeUsername,
  createAuthService,
  createInMemoryLoginAttemptProtection,
  safeRedirect,
} from "@dashboard/auth";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import {
  PermissionError,
  requirePermission as assertPermission,
  type Permission,
} from "@dashboard/permissions";
import { redirect } from "next/navigation";
import { getAuthSessionConfiguration, serverEnv } from "../env";
import { getDatabase } from "./database";

if (!process.env.NEXTAUTH_URL) process.env.NEXTAUTH_URL = serverEnv.APP_URL;

function authSecret(): string {
  if (!serverEnv.AUTH_SECRET)
    throw new Error("AUTH_SECRET must contain at least 32 characters when authentication is used");
  return serverEnv.AUTH_SECRET;
}
const sessionConfiguration = getAuthSessionConfiguration(serverEnv);
const loginProtection = createInMemoryLoginAttemptProtection();
export const authOptions: NextAuthOptions = {
  ...(serverEnv.AUTH_SECRET ? { secret: serverEnv.AUTH_SECRET } : {}),
  session: { strategy: "jwt", ...sessionConfiguration },
  jwt: { maxAge: sessionConfiguration.maxAge },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Local account",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        authSecret();
        if (!credentials?.username || !credentials.password) return null;
        const key = canonicalizeUsername(credentials.username);
        if (!loginProtection.consume(key)) return null;
        try {
          const { authStore } = await getDatabase();
          const user = await createAuthService(authStore).authenticate(
            credentials.username,
            credentials.password,
          );
          loginProtection.reset(key);
          return {
            id: user.id,
            name: user.displayName ?? user.username,
            username: user.username,
            displayName: user.displayName,
            isSystemAdmin: user.isSystemAdmin,
            authVersion: user.authVersion,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.username = user.username;
        token.displayName = user.displayName;
        token.isSystemAdmin = user.isSystemAdmin;
        token.authVersion = user.authVersion;
      }
      return token;
    },
    async session({ session, token }) {
      if (!token.sub || typeof token.authVersion !== "number") return session;
      const { authStore } = await getDatabase();
      const user = await createAuthService(authStore).validateSession(token.sub, token.authVersion);
      session.user = {
        ...session.user,
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        isSystemAdmin: user.isSystemAdmin,
      };
      return session;
    },
    redirect({ url, baseUrl }) {
      return safeRedirect(url, baseUrl);
    },
  },
};
export async function requireSession() {
  const session = await getServerSession(authOptions);
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
