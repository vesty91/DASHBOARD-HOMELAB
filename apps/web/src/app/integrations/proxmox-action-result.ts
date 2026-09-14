import { TRPCError } from "@trpc/server";
import { proxmoxUserError } from "./proxmox-error";

export type ProxmoxActionOutcome = { ok: true } | { ok: false; message: string };

export function toProxmoxActionOutcome(error: unknown): ProxmoxActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: proxmoxUserError(error) };
  return { ok: false, message: proxmoxUserError(error) };
}
