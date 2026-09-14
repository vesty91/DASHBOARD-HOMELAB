import { describe, expect, it } from "vitest";
import { hashSessionId, sanitizeAuditMetadata } from "./audit";
import { isSessionUsable, toPublicAuthSession } from "./sessions";

describe("audit sanitization", () => {
  it("redacts secrets and truncates metadata", () => {
    const sanitized = sanitizeAuditMetadata({
      password: "hunter2",
      clientSecret: "xyz",
      id_token: "eyJhbGciOiJIUzI1NiJ9.payload.sig",
      note: "ok",
      nested: { token: "abc", keep: true },
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/hunter2|xyz|eyJhbGci/u);
    expect(sanitized.note).toBe("ok");
    expect(hashSessionId("session-secret")).toHaveLength(16);
    expect(hashSessionId("session-secret")).not.toBe("session-secret");
  });
});

describe("session public projection", () => {
  it("marks the current session and hides revoked sessions", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const session = {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "u1",
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date("2026-09-15T12:00:00.000Z"),
      revokedAt: null,
      userAgent: "Mozilla/5.0",
      ip: null,
    };
    expect(toPublicAuthSession(session, session.id).current).toBe(true);
    expect(toPublicAuthSession(session, "other").current).toBe(false);
    expect(isSessionUsable(session, now)).toBe(true);
    expect(isSessionUsable({ ...session, revokedAt: now }, now)).toBe(false);
  });
});
