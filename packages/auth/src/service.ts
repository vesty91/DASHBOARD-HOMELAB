import { z } from "zod";
import { AuthError } from "./errors";
import { hashPassword, passwordSchema, verifyPassword } from "./password";
export function canonicalizeUsername(username: string): string {
  return username.trim().normalize("NFKC").toLowerCase();
}
export function safeRedirect(url: string, baseUrl: string): string {
  if (url.startsWith("/") && !url.startsWith("//")) return `${baseUrl}${url}`;
  try {
    return new URL(url).origin === baseUrl ? url : baseUrl;
  } catch {
    return baseUrl;
  }
}
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[\p{L}\p{N}._-]+$/u);
export interface AuthUser {
  id: string;
  username: string;
  displayName: string | null;
  status: "active" | "disabled";
  isSystemAdmin: boolean;
  authVersion: number;
}
export interface CredentialRecord extends AuthUser {
  passwordHash: string;
}
export interface AuthStore {
  findCredential(canonicalUsername: string): Promise<CredentialRecord | undefined>;
  markLogin(userId: string): Promise<void>;
  findUser(userId: string): Promise<AuthUser | undefined>;
  createFirstAdmin(input: {
    username: string;
    usernameCanonical: string;
    displayName?: string | null;
    passwordHash: string;
  }): Promise<AuthUser>;
  changePassword(userId: string, passwordHash: string): Promise<number>;
}
export const onboardingSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().max(100).optional(),
  password: passwordSchema,
});
let dummyHashPromise: Promise<string> | undefined;
function dummyHash() {
  return (dummyHashPromise ??= hashPassword("not-a-real-password-value"));
}
export function createAuthService(store: AuthStore) {
  return {
    async authenticate(username: string, password: string): Promise<AuthUser> {
      const record = await store.findCredential(canonicalizeUsername(username));
      const valid = await verifyPassword(record?.passwordHash ?? (await dummyHash()), password);
      if (!record || !valid || record.status !== "active")
        throw new AuthError("AUTH_INVALID_CREDENTIALS", "Invalid username or password");
      await store.markLogin(record.id);
      const { passwordHash: _, ...user } = record;
      return user;
    },
    async validateSession(userId: string, authVersion: number): Promise<AuthUser> {
      const user = await store.findUser(userId);
      if (!user || user.status !== "active" || user.authVersion !== authVersion)
        throw new AuthError("AUTH_SESSION_INVALID");
      return user;
    },
    async onboard(input: z.input<typeof onboardingSchema>): Promise<AuthUser> {
      const parsed = onboardingSchema.parse(input);
      return store.createFirstAdmin({
        username: parsed.username,
        usernameCanonical: canonicalizeUsername(parsed.username),
        displayName: parsed.displayName ?? null,
        passwordHash: await hashPassword(parsed.password),
      });
    },
    async changePassword(
      userId: string,
      currentPassword: string,
      nextPassword: string,
    ): Promise<number> {
      passwordSchema.parse(nextPassword);
      const user = await store.findUser(userId);
      if (!user) throw new AuthError("AUTH_REQUIRED");
      const credential = await store.findCredential(canonicalizeUsername(user.username));
      if (!credential || !(await verifyPassword(credential.passwordHash, currentPassword)))
        throw new AuthError("AUTH_INVALID_CREDENTIALS");
      return store.changePassword(userId, await hashPassword(nextPassword));
    },
  };
}
