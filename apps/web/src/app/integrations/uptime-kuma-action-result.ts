import { TRPCError } from "@trpc/server";
import { uptimeKumaUserError } from "./uptime-kuma-error";

export type UptimeKumaActionOutcome = { ok: true } | { ok: false; message: string };

export function toUptimeKumaActionOutcome(error: unknown): UptimeKumaActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: uptimeKumaUserError(error) };
  return { ok: false, message: uptimeKumaUserError(error) };
}
