import { createHash } from "node:crypto";
import { isSensitiveKey, redact } from "@dashboard/secrets";
import { z } from "zod";

export const AUDIT_ACTIONS = [
  "auth.login.success",
  "auth.login.failure",
  "auth.logout",
  "auth.oidc.login",
  "auth.oidc.link",
  "auth.oidc.mapping.update",
  "auth.oidc.settings.update",
  "user.update",
  "group.update",
  "permission.update",
  "integration.create",
  "integration.delete",
  "integration.secret.set",
  "docker.start",
  "docker.stop",
  "docker.restart",
  "backup.export",
  "backup.validate",
  "backup.restore",
  "session.revoke",
  "session.revoke_others",
  "session.revoke_all",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export const AUDIT_OUTCOMES = ["success", "failure", "denied"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const auditListInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(200).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  actorUserId: z.uuid().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
    .optional(),
});

export interface AuditEventInput {
  actorUserId?: string | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
}

export interface AuditEvent {
  id: string;
  actorUserId: string | null;
  action: AuditAction;
  targetType: string;
  targetId: string | null;
  outcome: AuditOutcome;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  sessionIdHash: string | null;
  createdAt: string;
}

const METADATA_MAX_KEYS = 20;
const METADATA_STRING_MAX = 200;
const USER_AGENT_MAX = 200;

export function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex").slice(0, 16);
}

export function boundUserAgent(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().slice(0, USER_AGENT_MAX) || null;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 3) return undefined;
  if (typeof value === "string") return value.slice(0, METADATA_STRING_MAX);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value))
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  if (typeof value === "object")
    return sanitizeAuditMetadata(value as Record<string, unknown>, depth + 1);
  return undefined;
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
  depth = 0,
): Record<string, unknown> {
  if (!metadata) return {};
  const redacted = redact(metadata) as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(redacted).slice(0, METADATA_MAX_KEYS)) {
    if (isSensitiveKey(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    const sanitized = sanitizeValue(value, depth);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}
