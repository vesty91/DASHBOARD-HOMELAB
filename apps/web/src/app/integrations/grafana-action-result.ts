import { TRPCError } from "@trpc/server";
import { grafanaUserError } from "./grafana-error";

export type GrafanaActionOutcome = { ok: true } | { ok: false; message: string };

export function toGrafanaActionOutcome(error: unknown): GrafanaActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: grafanaUserError(error) };
  return { ok: false, message: grafanaUserError(error) };
}
