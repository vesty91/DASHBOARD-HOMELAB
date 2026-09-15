import { IntegrationError, type IntegrationActor } from "@dashboard/integrations";
import { hasPermission, type Permission } from "@dashboard/permissions";
import type { QbittorrentPermissionsView } from "./types";

function isActive(actor: IntegrationActor): boolean {
  return Boolean(actor.userId && actor.subject && actor.subject.status === "active");
}

function hasAny(actor: IntegrationActor, permissions: readonly Permission[]): boolean {
  if (!actor.subject) return false;
  return permissions.some((permission) => hasPermission(actor.subject!, permission));
}

export function qbittorrentPermissionsView(actor: IntegrationActor): QbittorrentPermissionsView {
  if (!isActive(actor))
    return { canRead: false, canManage: false, canPause: false, canResume: false };
  const integrationUse = hasAny(actor, ["integration.use", "integration.manage"]);
  const integrationInteract = hasAny(actor, ["integration.interact", "integration.manage"]);
  return {
    canRead: integrationUse && hasAny(actor, ["qbittorrent.read"]),
    canManage: hasAny(actor, ["integration.manage"]),
    canPause: integrationInteract && hasAny(actor, ["qbittorrent.pause"]),
    canResume: integrationInteract && hasAny(actor, ["qbittorrent.resume"]),
  };
}

export type QbittorrentAccessKind = "read" | "manage" | "pause" | "resume";

export function assertQbittorrentAccess(
  actor: IntegrationActor,
  kind: QbittorrentAccessKind,
): void {
  if (!isActive(actor)) throw new IntegrationError("UNAUTHORIZED", "Authentication required");
  const view = qbittorrentPermissionsView(actor);
  switch (kind) {
    case "read":
      if (!view.canRead) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "manage":
      if (!view.canManage) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "pause":
      if (!view.canPause) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "resume":
      if (!view.canResume) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    default: {
      const _exhaustive: never = kind;
      throw new IntegrationError("FORBIDDEN", String(_exhaustive));
    }
  }
}
