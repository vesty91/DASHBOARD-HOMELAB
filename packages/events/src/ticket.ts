import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const REALTIME_TICKET_TTL_MS = 60_000;

const ticketPayloadSchema = z.object({
  userId: z.string().min(1).max(64),
  expiresAt: z.number().int().positive(),
});

export interface RealtimeTicket {
  token: string;
  expiresAt: string;
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

export function issueRealtimeTicket(
  secret: string,
  userId: string,
  now = new Date(),
): RealtimeTicket {
  if (secret.length < 32) throw new Error("AUTH_SECRET_TOO_SHORT");
  const expiresAtMs = now.getTime() + REALTIME_TICKET_TTL_MS;
  const payload = JSON.stringify({ userId, expiresAt: expiresAtMs });
  const token = `${encodePart(payload)}.${sign(secret, payload)}`;
  return { token, expiresAt: new Date(expiresAtMs).toISOString() };
}

export function verifyRealtimeTicket(
  secret: string,
  token: string,
  now = new Date(),
): { userId: string } | null {
  if (secret.length < 32) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  let payload: string;
  try {
    payload = decodePart(encodedPayload);
  } catch {
    return null;
  }
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
  return { userId: body.data.userId };
}
