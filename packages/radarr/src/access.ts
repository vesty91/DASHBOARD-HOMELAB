import { IntegrationError, type IntegrationActor } from "@dashboard/integrations";
import { hasPermission, type Permission } from "@dashboard/permissions";
import type { RadarrPermissionsView } from "./types";

function isActive(actor: IntegrationActor): boolean {
  return Boolean(actor.userId && actor.subject && actor.subject.status === "active");
}

function hasAny(actor: IntegrationActor, permissions: readonly Permission[]): boolean {
  if (!actor.subject) return false;
  return permissions.some((permission) => hasPermission(actor.subject!, permission));
}

export function radarrPermissionsView(actor: IntegrationActor): RadarrPermissionsView {
  if (!isActive(actor)) return { canRead: false, canManage: false, canCommand: false };
  const integrationUse = hasAny(actor, ["integration.use", "integration.manage"]);
  const integrationInteract = hasAny(actor, ["integration.interact", "integration.manage"]);
  return {
    canRead: integrationUse && hasAny(actor, ["radarr.read"]),
    canManage: hasAny(actor, ["integration.manage"]),
    canCommand: integrationInteract && hasAny(actor, ["radarr.command"]),
  };
}

export type RadarrAccessKind = "read" | "manage" | "command";

export function assertRadarrAccess(actor: IntegrationActor, kind: RadarrAccessKind): void {
  if (!isActive(actor)) throw new IntegrationError("UNAUTHORIZED", "Authentication required");
  const view = radarrPermissionsView(actor);
  switch (kind) {
    case "read":
      if (!view.canRead) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "manage":
      if (!view.canManage) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "command":
      if (!view.canCommand) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    default: {
      const _exhaustive: never = kind;
      throw new IntegrationError("FORBIDDEN", String(_exhaustive));
    }
  }
}
