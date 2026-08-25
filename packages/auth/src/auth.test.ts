import { describe, expect, it } from "vitest";
import {
  ARGON2_OPTIONS,
  canonicalizeUsername,
  createAuthService,
  hashPassword,
  needsPasswordRehash,
  safeRedirect,
  verifyPassword,
  type AuthStore,
  type AuthUser,
} from "./index";
function fixture() {
  let hash = "";
  const user: AuthUser = {
    id: "u1",
    username: "Vesty",
    displayName: null,
    status: "active",
    isSystemAdmin: true,
    authVersion: 1,
  };
  const store: AuthStore = {
    async findCredential(name) {
      return name === "vesty" && hash ? { ...user, passwordHash: hash } : undefined;
    },
    async markLogin() {},
    async findUser() {
      return user;
    },
    async createFirstAdmin() {
      return user;
    },
    async changePassword(_id, next) {
      hash = next;
      user.authVersion += 1;
      return user.authVersion;
    },
  };
  return {
    store,
    user,
    setHash(value: string) {
      hash = value;
    },
  };
}
describe("local authentication", () => {
  it("hashes and verifies Argon2id passwords", async () => {
    const value = await hashPassword("correct horse battery staple");
    expect(value).toContain("$argon2id$");
    expect(await verifyPassword(value, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(value, "wrong password")).toBe(false);
    expect(needsPasswordRehash(value)).toBe(false);
    expect(ARGON2_OPTIONS.memoryCost).toBe(65_536);
  });
  it("normalizes usernames deterministically", () => {
    expect(canonicalizeUsername(" VESTY ")).toBe("vesty");
  });
  it("rejects open redirects", () => {
    expect(safeRedirect("https://evil.example", "https://dashboard.example")).toBe(
      "https://dashboard.example",
    );
    expect(safeRedirect("/admin", "https://dashboard.example")).toBe(
      "https://dashboard.example/admin",
    );
  });
  it("returns the same generic error for unknown and wrong credentials", async () => {
    const f = fixture();
    f.setHash(await hashPassword("correct horse battery staple"));
    const service = createAuthService(f.store);
    await expect(service.authenticate("unknown", "wrong password")).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Invalid username or password",
    });
    await expect(service.authenticate("vesty", "wrong password")).rejects.toMatchObject({
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Invalid username or password",
    });
  });
  it("rejects disabled users and stale sessions", async () => {
    const f = fixture();
    f.user.status = "disabled";
    f.setHash(await hashPassword("correct horse battery staple"));
    const service = createAuthService(f.store);
    await expect(
      service.authenticate("vesty", "correct horse battery staple"),
    ).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" });
    await expect(service.validateSession("u1", 1)).rejects.toMatchObject({
      code: "AUTH_SESSION_INVALID",
    });
  });
  it("invalidates old sessions after password change", async () => {
    const f = fixture();
    f.setHash(await hashPassword("correct horse battery staple"));
    const service = createAuthService(f.store);
    expect(
      await service.changePassword("u1", "correct horse battery staple", "a new secure passphrase"),
    ).toBe(2);
    await expect(service.validateSession("u1", 1)).rejects.toMatchObject({
      code: "AUTH_SESSION_INVALID",
    });
  });
});
