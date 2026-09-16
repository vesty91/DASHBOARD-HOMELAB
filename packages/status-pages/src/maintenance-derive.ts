import type { MaintenanceWindowStatus } from "./types";

/**
 * Derives lifecycle status from the UTC clock.
 * Terminal states (`cancelled`, `completed`) are sticky.
 * Client-supplied `active` is never trusted blindly — callers must pass the
 * stored status and let this function recompute from startsAt/endsAt.
 */
export function deriveMaintenanceStatus(
  stored: MaintenanceWindowStatus,
  startsAt: Date,
  endsAt: Date,
  now: Date,
): MaintenanceWindowStatus {
  if (stored === "cancelled" || stored === "completed") return stored;
  const t = now.getTime();
  if (t >= endsAt.getTime()) return "completed";
  if (t >= startsAt.getTime()) return "active";
  return "scheduled";
}

export function isMaintenanceActiveNow(
  stored: MaintenanceWindowStatus,
  startsAt: Date,
  endsAt: Date,
  now: Date,
): boolean {
  return deriveMaintenanceStatus(stored, startsAt, endsAt, now) === "active";
}

export function rangesOverlap(
  aStartsAt: Date,
  aEndsAt: Date,
  bStartsAt: Date,
  bEndsAt: Date,
): boolean {
  return aStartsAt.getTime() < bEndsAt.getTime() && bStartsAt.getTime() < aEndsAt.getTime();
}
