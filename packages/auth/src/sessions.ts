import { createHash } from "node:crypto";

export interface AuthSessionRecord {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  ip: string | null;
}

export interface PublicAuthSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
}

export function sessionFingerprint(userAgent: string | null, ip: string | null): string {
  return createHash("sha256")
    .update(`${userAgent ?? ""}|${ip ?? ""}`, "utf8")
    .digest("hex")
    .slice(0, 12);
}

export function toPublicAuthSession(
  session: AuthSessionRecord,
  currentSessionId: string,
): PublicAuthSession {
  return {
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    userAgent: session.userAgent,
    ip: session.ip,
    current: session.id === currentSessionId,
  };
}

export function isSessionUsable(session: AuthSessionRecord, now = new Date()): boolean {
  return session.revokedAt == null && session.expiresAt.getTime() > now.getTime();
}
