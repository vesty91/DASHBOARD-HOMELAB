import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { EVENT_RESOURCE_ID } from "./events";

export const REALTIME_TICKET_TTL_MS = 60_000;
export const REALTIME_TICKET_MAX_SUBSCRIPTIONS = 50;
export const REALTIME_TICKET_MAX_PAYLOAD_BYTES = 4_096;
export const REALTIME_TICKET_MAX_TOKEN_BYTES = 8_192;

export const realtimeSubscriptionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("runtime") }),
  z.object({ kind: z.literal("notifications") }),
  z.object({ kind: z.literal("board"), id: EVENT_RESOURCE_ID }),
  z.object({ kind: z.literal("integration"), id: EVENT_RESOURCE_ID }),
]);

export type RealtimeSubscription = z.infer<typeof realtimeSubscriptionSchema>;

const ticketPayloadSchema = z.object({
  userId: z.string().min(1).max(64),
  expiresAt: z.number().int().positive(),
  subscriptions: z.array(realtimeSubscriptionSchema).max(REALTIME_TICKET_MAX_SUBSCRIPTIONS),
});

export interface RealtimeTicket {
  token: string;
  expiresAt: string;
}

export interface VerifiedRealtimeTicket {
  userId: string;
  subscriptions: RealtimeSubscription[];
}

export interface IssueRealtimeTicketInput {
  userId: string;
  subscriptions?: readonly RealtimeSubscription[];
}

function encodePart(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodePart(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function normalizeRealtimeSubscriptions(
  subscriptions: readonly RealtimeSubscription[],
): RealtimeSubscription[] {
  const seen = new Set<string>();
  const normalized: RealtimeSubscription[] = [];
  for (const subscription of subscriptions) {
    const parsed = realtimeSubscriptionSchema.safeParse(subscription);
    if (!parsed.success) continue;
    const key =
      parsed.data.kind === "runtime" || parsed.data.kind === "notifications"
        ? parsed.data.kind
        : `${parsed.data.kind}:${parsed.data.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(parsed.data);
    if (normalized.length >= REALTIME_TICKET_MAX_SUBSCRIPTIONS) break;
  }
  return normalized;
}

export function issueRealtimeTicket(
  secret: string,
  input: IssueRealtimeTicketInput,
  now = new Date(),
): RealtimeTicket {
  if (secret.length < 32) throw new Error("AUTH_SECRET_TOO_SHORT");
  const expiresAtMs = now.getTime() + REALTIME_TICKET_TTL_MS;
  const subscriptions = normalizeRealtimeSubscriptions(input.subscriptions ?? []);
  const payload = JSON.stringify({
    userId: input.userId,
    expiresAt: expiresAtMs,
    subscriptions,
  });
  if (Buffer.byteLength(payload, "utf8") > REALTIME_TICKET_MAX_PAYLOAD_BYTES) {
    throw new Error("TICKET_TOO_LARGE");
  }
  const token = `${encodePart(payload)}.${sign(secret, payload)}`;
  if (Buffer.byteLength(token, "utf8") > REALTIME_TICKET_MAX_TOKEN_BYTES) {
    throw new Error("TICKET_TOO_LARGE");
  }
  return { token, expiresAt: new Date(expiresAtMs).toISOString() };
}

export function verifyRealtimeTicket(
  secret: string,
  token: string,
  now = new Date(),
): VerifiedRealtimeTicket | null {
  if (secret.length < 32) return null;
  if (Buffer.byteLength(token, "utf8") > REALTIME_TICKET_MAX_TOKEN_BYTES) return null;
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) return null;
  let payload: string;
  try {
    payload = decodePart(encodedPayload);
  } catch {
    return null;
  }
  if (Buffer.byteLength(payload, "utf8") > REALTIME_TICKET_MAX_PAYLOAD_BYTES) return null;
  if (!signaturesEqual(signature, sign(secret, payload))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
  const body = ticketPayloadSchema.safeParse(parsed);
  if (!body.success) return null;
  if (body.data.expiresAt <= now.getTime()) return null;
  return {
    userId: body.data.userId,
    subscriptions: normalizeRealtimeSubscriptions(body.data.subscriptions),
  };
}
