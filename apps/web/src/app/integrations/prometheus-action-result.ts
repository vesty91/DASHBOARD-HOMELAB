import { TRPCError } from "@trpc/server";
import { prometheusUserError } from "./prometheus-error";

export type PrometheusActionOutcome = { ok: true } | { ok: false; message: string };

export function toPrometheusActionOutcome(error: unknown): PrometheusActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: prometheusUserError(error) };
  return { ok: false, message: prometheusUserError(error) };
}
