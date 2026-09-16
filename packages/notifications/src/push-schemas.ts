import { z } from "zod";
import { NotificationError } from "./errors";
import { PUSH_ENDPOINT_MAX, PUSH_KEY_MAX, PUSH_USER_AGENT_MAX } from "./push-types";

function isHttpsPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
      return true;
    return false;
  } catch {
    return false;
  }
}

export const pushSubscribeInputSchema = z
  .object({
    endpoint: z
      .string()
      .trim()
      .min(1)
      .max(PUSH_ENDPOINT_MAX)
      .refine(isHttpsPushEndpoint, "endpoint must be an https push URL"),
    keys: z
      .object({
        p256dh: z.string().trim().min(1).max(PUSH_KEY_MAX),
        auth: z.string().trim().min(1).max(PUSH_KEY_MAX),
      })
      .strict(),
    userAgent: z.string().trim().max(PUSH_USER_AGENT_MAX).nullable().optional(),
  })
  .strict();

export const pushUnsubscribeInputSchema = z
  .object({
    id: z.uuid().optional(),
    endpoint: z.string().trim().min(1).max(PUSH_ENDPOINT_MAX).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.id || value.endpoint), {
    message: "id or endpoint is required",
  });

export type PushSubscribeInput = z.infer<typeof pushSubscribeInputSchema>;
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeInputSchema>;

export function parsePushSubscribeInput(input: unknown): PushSubscribeInput {
  const parsed = pushSubscribeInputSchema.safeParse(input);
  if (!parsed.success)
    throw new NotificationError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  return parsed.data;
}

export function parsePushUnsubscribeInput(input: unknown): PushUnsubscribeInput {
  const parsed = pushUnsubscribeInputSchema.safeParse(input);
  if (!parsed.success)
    throw new NotificationError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  return parsed.data;
}
