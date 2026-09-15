import { IntegrationError, type IntegrationActor } from "@dashboard/integrations";
import { hasPermission, type Permission } from "@dashboard/permissions";
import type { SeerrPermissionsView } from "./types";

function isActive(actor: IntegrationActor): boolean {
  return Boolean(actor.userId && actor.subject && actor.subject.status === "active");
}

function hasAny(actor: IntegrationActor, permissions: readonly Permission[]): boolean {
  if (!actor.subject) return false;
  return permissions.some((permission) => hasPermission(actor.subject!, permission));
}

export function seerrPermissionsView(actor: IntegrationActor): SeerrPermissionsView {
  if (!isActive(actor)) return { canRead: false, canManage: false, canManageRequests: false };
  const integrationUse = hasAny(actor, ["integration.use", "integration.manage"]);
  const integrationInteract = hasAny(actor, ["integration.interact", "integration.manage"]);
  return {
    canRead: integrationUse && hasAny(actor, ["seerr.read"]),
    canManage: hasAny(actor, ["integration.manage"]),
    canManageRequests: integrationInteract && hasAny(actor, ["seerr.request.manage"]),
  };
}

export type SeerrAccessKind = "read" | "manage" | "request";

export function assertSeerrAccess(actor: IntegrationActor, kind: SeerrAccessKind): void {
  if (!isActive(actor)) throw new IntegrationError("UNAUTHORIZED", "Authentication required");
  const view = seerrPermissionsView(actor);
  switch (kind) {
    case "read":
      if (!view.canRead) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "manage":
      if (!view.canManage) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "request":
      if (!view.canManageRequests) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    default: {
      const _exhaustive: never = kind;
      throw new IntegrationError("FORBIDDEN", String(_exhaustive));
    }
  }
}
