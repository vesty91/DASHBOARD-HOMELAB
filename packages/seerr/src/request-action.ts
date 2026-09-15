import { IntegrationError } from "@dashboard/integrations";

export const SEERR_REQUEST_ID_MAX = 2_147_483_647;
export const SEERR_REQUEST_ACTIONS = ["approve", "decline"] as const;
export type SeerrRequestAction = (typeof SEERR_REQUEST_ACTIONS)[number];

export function assertSeerrRequestId(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > SEERR_REQUEST_ID_MAX)
    throw new IntegrationError("VALIDATION_ERROR", "Invalid Seerr request id");
  return value;
}

export function assertSeerrRequestAction(value: string): SeerrRequestAction {
  if (value === "approve" || value === "decline") return value;
  throw new IntegrationError("VALIDATION_ERROR", "Invalid Seerr request action");
}

export function seerrRequestActionPath(requestId: number, action: SeerrRequestAction): string {
  const id = assertSeerrRequestId(requestId);
  const status = assertSeerrRequestAction(action);
  return `/api/v1/request/${id}/${status}`;
}

export function seerrRequestResourceId(requestId: number): string {
  return `request:${assertSeerrRequestId(requestId)}`;
}

export function seerrRequestAuditAction(
  action: SeerrRequestAction,
): "seerr.approve" | "seerr.decline" {
  switch (action) {
    case "approve":
      return "seerr.approve";
    case "decline":
      return "seerr.decline";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function isSeerrRequestActionPath(pathname: string): boolean {
  const match = /^\/api\/v1\/request\/(\d+)\/(approve|decline)$/u.exec(pathname);
  if (!match) return false;
  const rawId = match[1];
  const id = Number(rawId);
  if (!Number.isInteger(id) || String(id) !== rawId) return false;
  try {
    assertSeerrRequestId(id);
    return true;
  } catch {
    return false;
  }
}
